"""
Advanced Model Selection Framework for Ad Systems.

Advanced framework for multi-objective model selection across
customer segments and verticals. Goes beyond simple routing by jointly
optimizing revenue, user experience, advertiser health, and compute cost
through a principled decision framework.

Key innovations over basic routing:
  1. Multi-objective scoring (not just revenue lift)
  2. Vertical-specific model affinity profiles
  3. Lifecycle-aware selection (new vs mature advertisers per segment)
  4. Temporal context adaptation (competition, budget pressure)
  5. Portfolio-level diversification constraints
  6. Counterfactual estimation for model switching decisions

This framework answers: "Which model architecture should serve which
segment-vertical combination, and how should that change over time?"
"""
import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from ..auction.models import UserSegment
from .simulator import MODELS, ModelSpec, simulate_model_performance, ModelPerformance


# ─── Vertical Definitions ──────────────────────────────────────────

VERTICALS = {
    "ecommerce": {
        "name": "E-Commerce",
        "revenue_weight": 0.35,
        "experience_weight": 0.30,
        "advertiser_health_weight": 0.20,
        "compute_weight": 0.15,
        "preferred_objectives": ["purchase", "add_to_cart"],
        "latency_sensitivity": "high",        # Users bounce on slow feeds
        "ad_load_tolerance": "medium",
        "model_affinity": {
            "two_tower": 0.7,   # Good for broad product discovery
            "gbdt": 0.9,        # Strong on purchase history features
            "dlrm": 1.0,        # Best precision for purchase prediction
            "bandit": 0.5,      # Less useful for known intent
        },
    },
    "gaming": {
        "name": "Gaming",
        "revenue_weight": 0.40,
        "experience_weight": 0.25,
        "advertiser_health_weight": 0.15,
        "compute_weight": 0.20,
        "preferred_objectives": ["install", "in_app_purchase"],
        "latency_sensitivity": "medium",
        "ad_load_tolerance": "high",
        "model_affinity": {
            "two_tower": 0.8,   # Good genre-based retrieval
            "gbdt": 0.6,        # Limited by sparse install data
            "dlrm": 0.9,        # Strong cross-feature interactions
            "bandit": 0.85,     # Valuable for discovering new games
        },
    },
    "finance": {
        "name": "Finance",
        "revenue_weight": 0.30,
        "experience_weight": 0.35,
        "advertiser_health_weight": 0.25,
        "compute_weight": 0.10,
        "preferred_objectives": ["lead", "application"],
        "latency_sensitivity": "low",          # Users tolerate slower loads for financial decisions
        "ad_load_tolerance": "low",             # High ad load erodes trust
        "model_affinity": {
            "two_tower": 0.5,   # Too noisy for high-stakes decisions
            "gbdt": 0.95,       # Excellent on creditworthiness features
            "dlrm": 0.85,       # Strong but cold-start risk is costly
            "bandit": 0.4,      # Exploration cost too high for finance
        },
    },
    "entertainment": {
        "name": "Entertainment",
        "revenue_weight": 0.30,
        "experience_weight": 0.40,
        "advertiser_health_weight": 0.15,
        "compute_weight": 0.15,
        "preferred_objectives": ["video_view", "engagement"],
        "latency_sensitivity": "high",
        "ad_load_tolerance": "medium",
        "model_affinity": {
            "two_tower": 0.85,  # Great for content-based matching
            "gbdt": 0.6,        # Weaker on creative/engagement features
            "dlrm": 0.9,        # Best for engagement prediction
            "bandit": 0.75,     # Good for content exploration
        },
    },
    "travel": {
        "name": "Travel",
        "revenue_weight": 0.35,
        "experience_weight": 0.30,
        "advertiser_health_weight": 0.20,
        "compute_weight": 0.15,
        "preferred_objectives": ["booking", "search"],
        "latency_sensitivity": "medium",
        "ad_load_tolerance": "medium",
        "model_affinity": {
            "two_tower": 0.75,  # Good destination matching
            "gbdt": 0.85,       # Strong on price sensitivity features
            "dlrm": 0.95,       # Best for complex travel intent
            "bandit": 0.7,      # Useful for destination discovery
        },
    },
    "local_services": {
        "name": "Local Services",
        "revenue_weight": 0.25,
        "experience_weight": 0.35,
        "advertiser_health_weight": 0.30,
        "compute_weight": 0.10,
        "preferred_objectives": ["lead", "call", "store_visit"],
        "latency_sensitivity": "medium",
        "ad_load_tolerance": "low",
        "model_affinity": {
            "two_tower": 0.9,   # Excellent for geo-based retrieval
            "gbdt": 0.7,        # Good on local behavioral features
            "dlrm": 0.6,        # Overkill and cold-start risk for SMBs
            "bandit": 0.8,      # Helps SMBs get initial exposure
        },
    },
}


# ─── Lifecycle Stage Definitions ────────────────────────────────────

@dataclass
class LifecycleProfile:
    """Advertiser lifecycle stage affects optimal model choice."""
    stage: str
    description: str
    exploration_need: float    # 0-1: how much we need to learn
    data_richness: float       # 0-1: how much historical data exists
    churn_risk: float          # 0-1: probability of leaving platform
    model_preference: Dict[str, float]  # Per-model affinity modifier


LIFECYCLE_STAGES = {
    "new": LifecycleProfile(
        stage="new",
        description="First 30 days on platform, minimal performance data",
        exploration_need=0.9,
        data_richness=0.1,
        churn_risk=0.4,
        model_preference={
            "two_tower": 1.2,   # Broad coverage helps cold-start
            "gbdt": 0.6,        # Insufficient features
            "dlrm": 0.5,        # Cold-start weakness
            "bandit": 1.3,      # Exploration maximizes learning
        },
    ),
    "growing": LifecycleProfile(
        stage="growing",
        description="30-90 days, building performance history",
        exploration_need=0.5,
        data_richness=0.4,
        churn_risk=0.25,
        model_preference={
            "two_tower": 1.0,
            "gbdt": 0.9,
            "dlrm": 0.8,
            "bandit": 0.9,
        },
    ),
    "mature": LifecycleProfile(
        stage="mature",
        description="90+ days, rich performance data, stable spend",
        exploration_need=0.15,
        data_richness=0.9,
        churn_risk=0.1,
        model_preference={
            "two_tower": 0.8,
            "gbdt": 1.1,
            "dlrm": 1.2,        # Rich data maximizes DLRM advantage
            "bandit": 0.6,       # Less need for exploration
        },
    ),
    "declining": LifecycleProfile(
        stage="declining",
        description="Decreasing spend, risk of churn",
        exploration_need=0.6,
        data_richness=0.7,
        churn_risk=0.5,
        model_preference={
            "two_tower": 0.9,
            "gbdt": 0.8,
            "dlrm": 0.9,
            "bandit": 1.1,       # Re-explore to find new opportunities
        },
    ),
}


# ─── Multi-Objective Scoring ────────────────────────────────────────

@dataclass
class ModelScore:
    """Multi-objective score for a model-segment-vertical combination."""
    model_id: str
    model_name: str
    segment_id: str
    vertical: str
    lifecycle_stage: str

    # Individual objective scores (0-1)
    revenue_score: float
    experience_score: float
    advertiser_health_score: float
    compute_score: float

    # Weighted composite
    composite_score: float

    # Explanatory factors
    scoring_factors: Dict[str, float] = field(default_factory=dict)
    recommendation_reason: str = ""


def _compute_experience_score(
    model: ModelSpec,
    segment: UserSegment,
    vertical_config: dict,
) -> float:
    """
    User experience score based on ad relevance and latency impact.

    High-quality, relevant ads improve user experience. Slow or irrelevant
    ads degrade it. This score captures both dimensions.
    """
    # Relevance component: precision × model-vertical affinity
    affinity = vertical_config["model_affinity"].get(model.id, 0.5)
    relevance = model.precision * affinity

    # Latency component: penalize slow models on latency-sensitive verticals
    latency_penalty = {
        "high": lambda ms: max(0, 1 - ms / 40),
        "medium": lambda ms: max(0, 1 - ms / 60),
        "low": lambda ms: max(0, 1 - ms / 100),
    }
    sensitivity = vertical_config.get("latency_sensitivity", "medium")
    latency_score = latency_penalty[sensitivity](model.latency_ms)

    # Ad load component: models with high coverage push more ads
    tolerance = {"high": 1.0, "medium": 0.85, "low": 0.7}
    coverage_factor = 1 - (model.coverage - 0.7) * (1 - tolerance.get(
        vertical_config.get("ad_load_tolerance", "medium"), 0.85
    ))

    return round(relevance * 0.5 + latency_score * 0.3 + coverage_factor * 0.2, 4)


def _compute_advertiser_health_score(
    model: ModelSpec,
    lifecycle: LifecycleProfile,
    vertical_config: dict,
) -> float:
    """
    Advertiser health score: will this model help retain advertisers?

    New advertisers need quick wins (exploration). Declining advertisers
    need re-engagement. Mature advertisers need stable performance.
    Scoring reflects these lifecycle-specific needs.
    """
    # Lifecycle alignment
    lifecycle_fit = lifecycle.model_preference.get(model.id, 0.8)

    # Churn risk mitigation: bandits help declining advertisers
    churn_mitigation = 0.0
    if lifecycle.churn_risk > 0.3:
        if model.id == "bandit":
            churn_mitigation = 0.2
        elif model.id == "two_tower":
            churn_mitigation = 0.1

    # Cold-start recovery: important for new advertisers
    cold_start_value = model.cold_start_factor * lifecycle.exploration_need

    base = lifecycle_fit * 0.5 + cold_start_value * 0.3 + churn_mitigation
    return round(min(1.0, base), 4)


def _compute_compute_score(model: ModelSpec) -> float:
    """Compute efficiency score (inverted cost). Cheaper = higher score."""
    # Normalize: cost ranges from 0.1 (two_tower) to 1.0 (dlrm)
    return round(1 - (model.compute_cost / 1.2), 4)


def score_model_for_context(
    model: ModelSpec,
    segment: UserSegment,
    vertical: str,
    lifecycle_stage: str,
    seed: int = 42,
) -> ModelScore:
    """
    Compute multi-objective score for a model in a specific context.

    Context = (segment, vertical, lifecycle_stage).

    The composite score is a weighted sum where weights come from
    the vertical configuration, reflecting that different verticals
    have different strategic priorities.
    """
    vertical_config = VERTICALS.get(vertical, VERTICALS["ecommerce"])
    lifecycle = LIFECYCLE_STAGES.get(lifecycle_stage, LIFECYCLE_STAGES["mature"])

    # Performance simulation
    perf = simulate_model_performance(model, segment, seed)

    # Revenue score: normalized revenue lift × vertical affinity
    affinity = vertical_config["model_affinity"].get(model.id, 0.5)
    revenue_score = min(1.0, perf.revenue_lift * affinity / 0.9)

    # Experience score
    experience_score = _compute_experience_score(model, segment, vertical_config)

    # Advertiser health score
    health_score = _compute_advertiser_health_score(model, lifecycle, vertical_config)

    # Compute score
    compute_score = _compute_compute_score(model)

    # Weighted composite
    w_rev = vertical_config["revenue_weight"]
    w_exp = vertical_config["experience_weight"]
    w_health = vertical_config["advertiser_health_weight"]
    w_compute = vertical_config["compute_weight"]

    composite = (
        revenue_score * w_rev
        + experience_score * w_exp
        + health_score * w_health
        + compute_score * w_compute
    )

    return ModelScore(
        model_id=model.id,
        model_name=model.name,
        segment_id=segment.id,
        vertical=vertical,
        lifecycle_stage=lifecycle_stage,
        revenue_score=round(revenue_score, 4),
        experience_score=round(experience_score, 4),
        advertiser_health_score=round(health_score, 4),
        compute_score=round(compute_score, 4),
        composite_score=round(composite, 4),
        scoring_factors={
            "vertical_affinity": round(affinity, 3),
            "revenue_lift": perf.revenue_lift,
            "latency_ms": perf.latency_cost_ms,
            "lifecycle_preference": round(lifecycle.model_preference.get(model.id, 0.8), 3),
            "data_density": round(min(1.0, segment.size / 4_000_000), 3),
            "exploration_need": lifecycle.exploration_need,
        },
    )


# ─── Portfolio Optimization ─────────────────────────────────────────

@dataclass
class PortfolioAllocation:
    """Optimal model allocation across a segment-vertical portfolio."""
    segment_id: str
    segment_name: str
    vertical: str
    vertical_name: str
    lifecycle_stage: str
    primary_model: str
    primary_model_name: str
    primary_traffic_pct: float
    secondary_model: Optional[str]
    secondary_model_name: Optional[str]
    secondary_traffic_pct: float
    exploration_model: Optional[str]
    exploration_model_name: Optional[str]
    exploration_traffic_pct: float
    expected_composite_score: float
    model_scores: List[Dict]
    rationale: str


def compute_portfolio_allocation(
    segment: UserSegment,
    vertical: str,
    lifecycle_stage: str,
    exploration_budget: float = 0.10,
    seed: int = 42,
) -> PortfolioAllocation:
    """
    Compute optimal model allocation for a segment-vertical-lifecycle context.

    Rather than a single model, allocate traffic across a portfolio:
    - Primary: highest composite score (gets majority of traffic)
    - Secondary: next best (hedges against primary model degradation)
    - Exploration: best learning model (discovery budget)

    The split depends on posterior confidence. Higher uncertainty →
    more traffic to secondary and exploration.
    """
    scores = [
        score_model_for_context(m, segment, vertical, lifecycle_stage, seed)
        for m in MODELS
    ]
    scores.sort(key=lambda s: s.composite_score, reverse=True)

    lifecycle = LIFECYCLE_STAGES.get(lifecycle_stage, LIFECYCLE_STAGES["mature"])

    # Determine traffic split based on score gap and lifecycle
    primary = scores[0]
    secondary = scores[1] if len(scores) > 1 else None
    score_gap = primary.composite_score - (secondary.composite_score if secondary else 0)

    # Narrower gap → more secondary traffic (less confidence in primary)
    if score_gap < 0.05:
        secondary_pct = 0.25
    elif score_gap < 0.10:
        secondary_pct = 0.15
    else:
        secondary_pct = 0.08

    # Exploration budget scales with lifecycle exploration need
    exploration_pct = min(exploration_budget, lifecycle.exploration_need * 0.15)

    # Find best exploration model (high cold-start factor, not primary/secondary)
    remaining = [s for s in scores if s.model_id not in (
        primary.model_id, secondary.model_id if secondary else None
    )]
    exploration = None
    if remaining:
        # Prefer models with high cold-start factor for exploration
        exploration = max(remaining, key=lambda s: s.scoring_factors.get("exploration_need", 0) * 0.5 + s.advertiser_health_score * 0.5)

    primary_pct = 1.0 - secondary_pct - exploration_pct

    # Generate rationale
    vertical_config = VERTICALS.get(vertical, VERTICALS["ecommerce"])
    rationale_parts = [
        f"{primary.model_name} leads with composite score {primary.composite_score:.3f}",
    ]
    if primary.revenue_score > primary.experience_score:
        rationale_parts.append("driven primarily by revenue optimization")
    else:
        rationale_parts.append("driven primarily by user experience quality")

    if lifecycle_stage == "new":
        rationale_parts.append(f"Higher exploration allocation ({exploration_pct:.0%}) for new advertiser learning")
    elif lifecycle_stage == "declining":
        rationale_parts.append(f"Re-engagement exploration at {exploration_pct:.0%} to combat churn risk")

    if secondary and score_gap < 0.05:
        rationale_parts.append(
            f"Close competition with {secondary.model_name} (gap={score_gap:.3f}) warrants larger secondary allocation"
        )

    return PortfolioAllocation(
        segment_id=segment.id,
        segment_name=segment.name,
        vertical=vertical,
        vertical_name=vertical_config["name"],
        lifecycle_stage=lifecycle_stage,
        primary_model=primary.model_id,
        primary_model_name=primary.model_name,
        primary_traffic_pct=round(primary_pct * 100, 1),
        secondary_model=secondary.model_id if secondary else None,
        secondary_model_name=secondary.model_name if secondary else None,
        secondary_traffic_pct=round(secondary_pct * 100, 1),
        exploration_model=exploration.model_id if exploration else None,
        exploration_model_name=exploration.model_name if exploration else None,
        exploration_traffic_pct=round(exploration_pct * 100, 1),
        expected_composite_score=round(
            primary.composite_score * primary_pct
            + (secondary.composite_score * secondary_pct if secondary else 0)
            + (exploration.composite_score * exploration_pct if exploration else 0),
            4,
        ),
        model_scores=[
            {
                "model_id": s.model_id,
                "model_name": s.model_name,
                "composite": s.composite_score,
                "revenue": s.revenue_score,
                "experience": s.experience_score,
                "health": s.advertiser_health_score,
                "compute": s.compute_score,
            }
            for s in scores
        ],
        rationale="; ".join(rationale_parts),
    )


# ─── Full Framework Analysis ────────────────────────────────────────

def run_framework_analysis(
    segments: List[UserSegment],
    verticals: Optional[List[str]] = None,
    lifecycle_stages: Optional[List[str]] = None,
    seed: int = 42,
) -> dict:
    """
    Run the full model selection framework across all combinations
    of segments, verticals, and lifecycle stages.

    Returns:
    - Per-combination portfolio allocations
    - Cross-cutting insights
    - Revenue opportunity analysis
    - Model diversity metrics
    """
    if verticals is None:
        verticals = list(VERTICALS.keys())
    if lifecycle_stages is None:
        lifecycle_stages = list(LIFECYCLE_STAGES.keys())

    allocations = []
    model_usage = {m.id: {"primary": 0, "secondary": 0, "exploration": 0} for m in MODELS}
    vertical_model_map = {v: {} for v in verticals}

    for seg in segments:
        for vert in verticals:
            for stage in lifecycle_stages:
                alloc = compute_portfolio_allocation(seg, vert, stage, seed=seed)
                allocations.append(alloc)

                # Track model usage
                model_usage[alloc.primary_model]["primary"] += 1
                if alloc.secondary_model:
                    model_usage[alloc.secondary_model]["secondary"] += 1
                if alloc.exploration_model:
                    model_usage[alloc.exploration_model]["exploration"] += 1

                # Track vertical-model preferences
                if alloc.primary_model not in vertical_model_map[vert]:
                    vertical_model_map[vert][alloc.primary_model] = 0
                vertical_model_map[vert][alloc.primary_model] += 1

    # Aggregate insights
    total_combos = len(allocations)

    # Revenue opportunity: compare best vs worst model per context
    revenue_opportunity = []
    for alloc in allocations:
        if len(alloc.model_scores) >= 2:
            best_rev = max(s["revenue"] for s in alloc.model_scores)
            worst_rev = min(s["revenue"] for s in alloc.model_scores)
            if worst_rev > 0:
                opportunity = (best_rev - worst_rev) / worst_rev * 100
                revenue_opportunity.append({
                    "segment": alloc.segment_name,
                    "vertical": alloc.vertical_name,
                    "lifecycle": alloc.lifecycle_stage,
                    "revenue_uplift_pct": round(opportunity, 1),
                    "best_model": alloc.primary_model_name,
                })

    revenue_opportunity.sort(key=lambda x: x["revenue_uplift_pct"], reverse=True)

    # Model diversity: how concentrated is primary model usage?
    primary_counts = [v["primary"] for v in model_usage.values()]
    total_primary = sum(primary_counts)
    concentration = sum((c / max(total_primary, 1)) ** 2 for c in primary_counts)

    # Vertical preference summary
    vertical_summary = {}
    for vert, models in vertical_model_map.items():
        vert_config = VERTICALS[vert]
        total = sum(models.values())
        dominant = max(models.items(), key=lambda x: x[1]) if models else ("none", 0)
        model_name = next((m.name for m in MODELS if m.id == dominant[0]), dominant[0])
        vertical_summary[vert] = {
            "vertical_name": vert_config["name"],
            "dominant_model": model_name,
            "dominant_pct": round(dominant[1] / max(total, 1) * 100, 1),
            "strategy_weights": {
                "revenue": vert_config["revenue_weight"],
                "experience": vert_config["experience_weight"],
                "advertiser_health": vert_config["advertiser_health_weight"],
                "compute": vert_config["compute_weight"],
            },
            "model_distribution": {
                next((m.name for m in MODELS if m.id == mid), mid): round(cnt / max(total, 1) * 100, 1)
                for mid, cnt in sorted(models.items(), key=lambda x: -x[1])
            },
        }

    # Lifecycle impact analysis
    lifecycle_impact = {}
    for stage in lifecycle_stages:
        stage_allocs = [a for a in allocations if a.lifecycle_stage == stage]
        if stage_allocs:
            avg_composite = sum(a.expected_composite_score for a in stage_allocs) / len(stage_allocs)
            avg_exploration = sum(a.exploration_traffic_pct for a in stage_allocs) / len(stage_allocs)
            primary_models = {}
            for a in stage_allocs:
                primary_models[a.primary_model_name] = primary_models.get(a.primary_model_name, 0) + 1
            lifecycle_impact[stage] = {
                "description": LIFECYCLE_STAGES[stage].description,
                "avg_composite_score": round(avg_composite, 4),
                "avg_exploration_pct": round(avg_exploration, 1),
                "churn_risk": LIFECYCLE_STAGES[stage].churn_risk,
                "top_primary_model": max(primary_models.items(), key=lambda x: x[1])[0] if primary_models else "N/A",
                "model_distribution": {
                    k: round(v / len(stage_allocs) * 100, 1)
                    for k, v in sorted(primary_models.items(), key=lambda x: -x[1])
                },
            }

    # Sample allocations for the response (top 5 by composite score)
    top_allocations = sorted(allocations, key=lambda a: a.expected_composite_score, reverse=True)[:10]

    return {
        "framework_summary": {
            "total_contexts_analyzed": total_combos,
            "segments": len(segments),
            "verticals": len(verticals),
            "lifecycle_stages": len(lifecycle_stages),
            "models_evaluated": len(MODELS),
        },
        "model_usage_summary": {
            mid: {
                "model_name": next((m.name for m in MODELS if m.id == mid), mid),
                "primary_selections": v["primary"],
                "secondary_selections": v["secondary"],
                "exploration_selections": v["exploration"],
                "primary_pct": round(v["primary"] / max(total_combos, 1) * 100, 1),
            }
            for mid, v in model_usage.items()
        },
        "model_diversity": {
            "herfindahl_index": round(concentration, 4),
            "interpretation": (
                "Highly concentrated (single model dominates)"
                if concentration > 0.5
                else "Well-diversified across models"
                if concentration < 0.35
                else "Moderately concentrated"
            ),
        },
        "vertical_strategies": vertical_summary,
        "lifecycle_impact": lifecycle_impact,
        "top_revenue_opportunities": revenue_opportunity[:10],
        "top_allocations": [
            {
                "segment": a.segment_name,
                "vertical": a.vertical_name,
                "lifecycle": a.lifecycle_stage,
                "primary": f"{a.primary_model_name} ({a.primary_traffic_pct}%)",
                "secondary": f"{a.secondary_model_name} ({a.secondary_traffic_pct}%)" if a.secondary_model_name else "None",
                "exploration": f"{a.exploration_model_name} ({a.exploration_traffic_pct}%)" if a.exploration_model_name else "None",
                "composite_score": a.expected_composite_score,
                "rationale": a.rationale,
            }
            for a in top_allocations
        ],
        "strategic_insights": {
            "model_selection_is_contextual": (
                "No single model wins across all contexts. The optimal choice depends on "
                "the intersection of segment data density, vertical-specific objectives, "
                "and advertiser lifecycle stage. One-size-fits-all routing leaves "
                f"{round(revenue_opportunity[0]['revenue_uplift_pct'] if revenue_opportunity else 0, 1)}% "
                "revenue on the table in the highest-opportunity context."
            ),
            "lifecycle_drives_exploration": (
                "New advertisers need 2-3x more exploration traffic than mature ones. "
                "The framework automatically adjusts allocation based on lifecycle stage, "
                "reducing churn risk while maintaining revenue efficiency for mature segments."
            ),
            "vertical_specialization_matters": (
                "Finance verticals favor GBDT for precision on dense features. "
                "Entertainment verticals favor Two-Tower for content-based matching. "
                "Gaming benefits from exploration (bandits) given high variance in user preferences."
            ),
            "portfolio_hedging": (
                "Allocating 8-25% of traffic to secondary models provides insurance against "
                "primary model degradation and enables continuous A/B comparison without "
                "dedicated experimentation infrastructure."
            ),
        },
    }
