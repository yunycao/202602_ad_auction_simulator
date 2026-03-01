"""
Financial Services Scenario: End-to-End Recommender Algorithm Comparison.

Simulates optimizing ad delivery for financial services advertisers
(credit cards, loans, insurance, investment platforms) across multiple
cutting-edge recommender algorithms with realistic constraints:

  - Regulatory sensitivity: Finance ads have compliance requirements
  - High CPAs: $50-200 per lead vs $2-10 for e-commerce
  - Long conversion windows: 7-30 days vs instant for gaming
  - Trust-dependent CTR: Users need confidence before clicking finance ads
  - Risk asymmetry: A bad financial recommendation has real consequences

Algorithms compared:
  1. Two-Tower Retrieval     — Fast but imprecise for high-stakes finance
  2. GBDT Ranker             — Strong on tabular credit/income features
  3. DLRM Deep Model         — Best precision but cold-start risk is costly
  4. Contextual Bandit       — Exploration for new financial products
  5. Hybrid Ensemble         — Weighted combination adapting by sub-vertical
  6. Risk-Adjusted Ranker    — Custom: penalizes models whose errors lead
                               to poor financial matches (user protection)

The scenario runs a 30-day simulation tracking revenue, conversion quality,
advertiser satisfaction, and user trust metrics.
"""
import random
import math
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from ..auction.models import UserSegment
from .simulator import MODELS, ModelSpec, simulate_model_performance


# ─── Finance Sub-Verticals ──────────────────────────────────────────

FINANCE_SUB_VERTICALS = {
    "credit_cards": {
        "name": "Credit Cards",
        "avg_cpa": 85.0,
        "conversion_window_days": 14,
        "trust_sensitivity": 0.8,   # How much user trust affects CTR
        "regulatory_risk": 0.6,
        "data_richness": 0.9,       # Lots of transaction data
    },
    "personal_loans": {
        "name": "Personal Loans",
        "avg_cpa": 120.0,
        "conversion_window_days": 21,
        "trust_sensitivity": 0.9,
        "regulatory_risk": 0.8,
        "data_richness": 0.7,
    },
    "insurance": {
        "name": "Insurance",
        "avg_cpa": 65.0,
        "conversion_window_days": 30,
        "trust_sensitivity": 0.85,
        "regulatory_risk": 0.7,
        "data_richness": 0.6,
    },
    "investment": {
        "name": "Investment Platforms",
        "avg_cpa": 150.0,
        "conversion_window_days": 7,
        "trust_sensitivity": 0.95,
        "regulatory_risk": 0.9,
        "data_richness": 0.5,
    },
    "neobanks": {
        "name": "Neobanks / Fintech",
        "avg_cpa": 45.0,
        "conversion_window_days": 3,
        "trust_sensitivity": 0.6,
        "regulatory_risk": 0.4,
        "data_richness": 0.4,
    },
}


# ─── Extended Algorithm Definitions ──────────────────────────────────

@dataclass
class AlgorithmSpec:
    id: str
    name: str
    description: str
    latency_ms: float
    precision_base: float        # Base ranking quality
    cold_start_factor: float     # Performance on sparse data
    coverage: float              # Fraction of candidates scored
    compute_cost: float          # Relative cost
    trust_sensitivity: float     # How well it handles trust-dependent CTR
    risk_awareness: float        # Ability to avoid bad recommendations
    ensemble_capable: bool       # Can participate in ensemble


ALGORITHMS = [
    AlgorithmSpec(
        "two_tower", "Two-Tower Retrieval",
        "Dual-encoder with ANN lookup. Fast but limited feature interaction depth for complex financial decisions.",
        latency_ms=5, precision_base=0.72, cold_start_factor=0.65,
        coverage=0.95, compute_cost=0.1, trust_sensitivity=0.4,
        risk_awareness=0.3, ensemble_capable=True,
    ),
    AlgorithmSpec(
        "gbdt", "GBDT Ranker (XGBoost)",
        "Gradient-boosted trees excel on tabular financial features: credit score bands, income brackets, account tenure.",
        latency_ms=12, precision_base=0.88, cold_start_factor=0.45,
        coverage=0.78, compute_cost=0.3, trust_sensitivity=0.7,
        risk_awareness=0.65, ensemble_capable=True,
    ),
    AlgorithmSpec(
        "dlrm", "DLRM Deep Model",
        "Facebook's Deep Learning Recommendation Model. Best precision on dense features but expensive and cold-start weak.",
        latency_ms=25, precision_base=0.92, cold_start_factor=0.38,
        coverage=0.85, compute_cost=1.0, trust_sensitivity=0.75,
        risk_awareness=0.6, ensemble_capable=True,
    ),
    AlgorithmSpec(
        "bandit", "Contextual Bandit (LinUCB)",
        "Upper confidence bound with contextual features. Best for exploring new financial products with limited data.",
        latency_ms=8, precision_base=0.68, cold_start_factor=0.82,
        coverage=0.82, compute_cost=0.2, trust_sensitivity=0.5,
        risk_awareness=0.4, ensemble_capable=True,
    ),
    AlgorithmSpec(
        "hybrid_ensemble", "Hybrid Ensemble",
        "Weighted combination: GBDT (40%) + DLRM (35%) + Bandit (25%). Adapts weights by sub-vertical and data density.",
        latency_ms=30, precision_base=0.94, cold_start_factor=0.58,
        coverage=0.88, compute_cost=1.4, trust_sensitivity=0.78,
        risk_awareness=0.7, ensemble_capable=False,
    ),
    AlgorithmSpec(
        "risk_adjusted", "Risk-Adjusted Ranker",
        "Custom architecture: DLRM backbone with risk penalty head. Penalizes predictions that lead to poor financial matches.",
        latency_ms=28, precision_base=0.90, cold_start_factor=0.42,
        coverage=0.83, compute_cost=1.2, trust_sensitivity=0.9,
        risk_awareness=0.95, ensemble_capable=False,
    ),
]

ALGO_MAP = {a.id: a for a in ALGORITHMS}


# ─── Simulation Engine ──────────────────────────────────────────────

@dataclass
class DailyResult:
    day: int
    impressions: int
    clicks: int
    conversions: int
    revenue: float
    ctr: float
    cvr: float
    cpa_effective: float
    user_trust_score: float       # 0-1: accumulated user satisfaction
    advertiser_satisfaction: float # 0-1: are advertisers hitting ROI targets
    risk_incidents: int           # Bad recommendations caught
    latency_p50: float


@dataclass
class AlgorithmResult:
    algorithm_id: str
    algorithm_name: str
    description: str
    daily_results: List[DailyResult]
    total_revenue: float
    total_conversions: int
    avg_ctr: float
    avg_cvr: float
    avg_cpa: float
    final_trust_score: float
    final_advertiser_satisfaction: float
    total_risk_incidents: int
    avg_latency: float
    compute_cost_30d: float

    # Composite scoring
    revenue_score: float          # normalized 0-1
    quality_score: float          # trust + risk awareness
    efficiency_score: float       # revenue per compute
    overall_score: float          # weighted composite


def simulate_algorithm(
    algo: AlgorithmSpec,
    segment: UserSegment,
    sub_vertical: str,
    days: int = 30,
    daily_impressions: int = 10000,
    seed: int = 42,
) -> AlgorithmResult:
    """
    Simulate a 30-day campaign for a financial services sub-vertical
    using a specific recommender algorithm.
    """
    rng = random.Random(seed + hash(algo.id) + hash(sub_vertical))
    sv = FINANCE_SUB_VERTICALS[sub_vertical]

    # Base performance adjusted for financial services characteristics
    data_density = min(1.0, segment.size / 4_000_000)
    warmth = data_density * sv["data_richness"]

    if warmth > 0.4:
        base_ctr = segment.avg_ctr * algo.precision_base * 1.1
    else:
        base_ctr = segment.avg_ctr * algo.precision_base * algo.cold_start_factor

    # Trust adjustment: finance ads need user trust to get clicks
    trust_factor = 0.6 + 0.4 * algo.trust_sensitivity * sv["trust_sensitivity"]
    base_ctr *= trust_factor

    # CVR depends on match quality (precision) and conversion window
    window_factor = min(1.0, 7 / sv["conversion_window_days"])  # Shorter windows → harder
    base_cvr = segment.avg_cvr * algo.precision_base * window_factor

    daily_results = []
    cumulative_trust = 0.7  # Start with moderate trust
    cumulative_adv_sat = 0.5
    total_revenue = 0
    total_conversions = 0
    total_risk = 0

    for day in range(days):
        # Day-over-day learning: algorithms improve with more data
        learning_factor = 1 + 0.3 * (1 - math.exp(-day / 10))
        # But diminishing returns — the learning rate depends on algo
        if algo.id == "bandit":
            learning_factor *= 1.15  # Bandits learn fastest early
        elif algo.id == "dlrm":
            learning_factor *= 1 + 0.1 * min(1, day / 15)  # DLRM needs data to shine
        elif algo.id == "hybrid_ensemble":
            learning_factor *= 1.1  # Ensemble benefits from diverse signals

        # Daily noise
        noise = 1 + (rng.random() - 0.5) * 0.15

        day_ctr = base_ctr * learning_factor * noise * (0.95 + 0.05 * cumulative_trust)
        day_ctr = max(0.002, min(0.12, day_ctr))

        day_cvr_noise = 1 + (rng.random() - 0.5) * 0.2
        day_cvr = base_cvr * learning_factor * day_cvr_noise
        day_cvr = max(0.001, min(0.08, day_cvr))

        impressions = daily_impressions
        clicks = int(impressions * day_ctr)
        conversions = int(clicks * day_cvr)

        # Revenue: CPA × conversions (financial services revenue model)
        day_revenue = conversions * sv["avg_cpa"]

        # Risk incidents: bad recommendations (wrong financial product shown)
        risk_base = max(0, (1 - algo.risk_awareness) * sv["regulatory_risk"])
        risk_incidents = int(clicks * risk_base * 0.02 * (rng.random() + 0.5))

        # Trust evolution: good matches build trust, risk incidents destroy it
        trust_delta = 0.005 * (day_cvr / max(base_cvr, 0.001)) - 0.02 * risk_incidents / max(clicks, 1)
        cumulative_trust = max(0.1, min(1.0, cumulative_trust + trust_delta))

        # Advertiser satisfaction: are they hitting CPA targets?
        effective_cpa = day_revenue / max(conversions, 1)
        target_cpa = sv["avg_cpa"]
        cpa_ratio = effective_cpa / target_cpa if target_cpa > 0 else 1
        adv_delta = 0.02 * (cpa_ratio - 0.8) if cpa_ratio > 0.8 else -0.03
        cumulative_adv_sat = max(0.1, min(1.0, cumulative_adv_sat + adv_delta))

        total_revenue += day_revenue
        total_conversions += conversions
        total_risk += risk_incidents

        daily_results.append(DailyResult(
            day=day + 1,
            impressions=impressions,
            clicks=clicks,
            conversions=conversions,
            revenue=round(day_revenue, 2),
            ctr=round(day_ctr, 5),
            cvr=round(day_cvr, 5),
            cpa_effective=round(effective_cpa, 2),
            user_trust_score=round(cumulative_trust, 4),
            advertiser_satisfaction=round(cumulative_adv_sat, 4),
            risk_incidents=risk_incidents,
            latency_p50=round(algo.latency_ms * (1 + (1 - data_density) * 0.3), 1),
        ))

    avg_ctr = sum(d.ctr for d in daily_results) / days
    avg_cvr = sum(d.cvr for d in daily_results) / days
    avg_cpa = total_revenue / max(total_conversions, 1)
    avg_latency = sum(d.latency_p50 for d in daily_results) / days
    compute_30d = algo.compute_cost * daily_impressions * days / 1000  # per 1K inferences

    return AlgorithmResult(
        algorithm_id=algo.id,
        algorithm_name=algo.name,
        description=algo.description,
        daily_results=daily_results,
        total_revenue=round(total_revenue, 2),
        total_conversions=total_conversions,
        avg_ctr=round(avg_ctr, 5),
        avg_cvr=round(avg_cvr, 5),
        avg_cpa=round(avg_cpa, 2),
        final_trust_score=round(cumulative_trust, 4),
        final_advertiser_satisfaction=round(cumulative_adv_sat, 4),
        total_risk_incidents=total_risk,
        avg_latency=round(avg_latency, 1),
        compute_cost_30d=round(compute_30d, 1),
        # Scores computed after all algorithms run
        revenue_score=0, quality_score=0, efficiency_score=0, overall_score=0,
    )


def run_finance_scenario(
    segment_id: str = "biz_professionals",
    sub_vertical: str = "credit_cards",
    days: int = 30,
    daily_impressions: int = 10000,
    seed: int = 42,
) -> dict:
    """
    Run the full Financial Services scenario across all 6 algorithms.

    Returns ranked results with the recommendation and detailed analysis.
    """
    from ..simulation.users import get_segment
    segment = get_segment(segment_id)
    if not segment:
        # Fallback
        segment = UserSegment(
            id="biz_professionals", name="Business Professionals",
            size=2_100_000, avg_ctr=0.033, avg_cvr=0.025,
        )

    sv_config = FINANCE_SUB_VERTICALS.get(sub_vertical, FINANCE_SUB_VERTICALS["credit_cards"])

    # Run all algorithms
    results = []
    for algo in ALGORITHMS:
        result = simulate_algorithm(algo, segment, sub_vertical, days, daily_impressions, seed)
        results.append(result)

    # Normalize scores across algorithms
    max_rev = max(r.total_revenue for r in results) or 1
    max_compute = max(r.compute_cost_30d for r in results) or 1

    for r in results:
        r.revenue_score = round(r.total_revenue / max_rev, 4)
        # Quality: trust + risk avoidance
        risk_score = 1 - (r.total_risk_incidents / max(max(rr.total_risk_incidents for rr in results), 1))
        r.quality_score = round(r.final_trust_score * 0.5 + risk_score * 0.5, 4)
        # Efficiency: revenue per compute
        r.efficiency_score = round(
            (r.total_revenue / max(r.compute_cost_30d, 0.1)) /
            max(rr.total_revenue / max(rr.compute_cost_30d, 0.1) for rr in results),
            4,
        )
        # Overall: Finance-specific weights (trust matters more than compute)
        r.overall_score = round(
            r.revenue_score * 0.30 +
            r.quality_score * 0.35 +
            r.efficiency_score * 0.15 +
            r.final_advertiser_satisfaction * 0.20,
            4,
        )

    # Rank by overall score
    results.sort(key=lambda r: r.overall_score, reverse=True)
    winner = results[0]
    runner_up = results[1] if len(results) > 1 else None

    # Build learning curves for comparison
    learning_curves = {}
    for r in results:
        learning_curves[r.algorithm_id] = {
            "revenue": [d.revenue for d in r.daily_results],
            "trust": [d.user_trust_score for d in r.daily_results],
            "ctr": [d.ctr for d in r.daily_results],
        }

    # Build the recommendation
    recommendation = {
        "winner": winner.algorithm_name,
        "winner_id": winner.algorithm_id,
        "overall_score": winner.overall_score,
        "rationale": _build_rationale(winner, runner_up, sv_config, sub_vertical),
        "deployment_notes": _build_deployment_notes(winner, sv_config),
    }

    return {
        "scenario": {
            "name": f"Financial Services: {sv_config['name']}",
            "segment": segment.name,
            "segment_id": segment.id,
            "sub_vertical": sub_vertical,
            "sub_vertical_name": sv_config["name"],
            "days": days,
            "daily_impressions": daily_impressions,
            "avg_cpa_target": sv_config["avg_cpa"],
            "conversion_window": sv_config["conversion_window_days"],
            "trust_sensitivity": sv_config["trust_sensitivity"],
            "regulatory_risk": sv_config["regulatory_risk"],
        },
        "recommendation": recommendation,
        "rankings": [
            {
                "rank": i + 1,
                "algorithm_id": r.algorithm_id,
                "algorithm_name": r.algorithm_name,
                "description": r.description,
                "overall_score": r.overall_score,
                "revenue_score": r.revenue_score,
                "quality_score": r.quality_score,
                "efficiency_score": r.efficiency_score,
                "total_revenue": r.total_revenue,
                "total_conversions": r.total_conversions,
                "avg_ctr": r.avg_ctr,
                "avg_cvr": r.avg_cvr,
                "avg_cpa": r.avg_cpa,
                "final_trust": r.final_trust_score,
                "final_adv_satisfaction": r.final_advertiser_satisfaction,
                "risk_incidents": r.total_risk_incidents,
                "avg_latency": r.avg_latency,
                "compute_cost_30d": r.compute_cost_30d,
            }
            for i, r in enumerate(results)
        ],
        "learning_curves": learning_curves,
        "sub_verticals": {
            k: {"name": v["name"], "avg_cpa": v["avg_cpa"],
                "trust_sensitivity": v["trust_sensitivity"],
                "regulatory_risk": v["regulatory_risk"]}
            for k, v in FINANCE_SUB_VERTICALS.items()
        },
    }


def _build_rationale(winner, runner_up, sv_config, sub_vertical):
    parts = [
        f"{winner.algorithm_name} wins with overall score {winner.overall_score:.3f}",
        f"generating ${winner.total_revenue:,.0f} revenue over 30 days "
        f"with {winner.total_conversions} conversions at ${winner.avg_cpa:.0f} CPA.",
    ]

    if winner.quality_score > winner.revenue_score:
        parts.append(
            "The win is driven by quality (trust + risk management) "
            "rather than raw revenue — critical in financial services where "
            "a bad recommendation erodes user trust and invites regulatory scrutiny."
        )
    else:
        parts.append(
            "Strong revenue generation combined with acceptable quality metrics. "
            "Financial services demand both — high revenue with low risk."
        )

    if runner_up:
        gap = winner.overall_score - runner_up.overall_score
        if gap < 0.03:
            parts.append(
                f"Close competition with {runner_up.algorithm_name} (gap: {gap:.3f}). "
                f"Consider A/B testing both in production."
            )

    if sv_config["regulatory_risk"] > 0.7:
        parts.append(
            f"High regulatory risk ({sv_config['regulatory_risk']}) in {sv_config['name']} "
            f"makes risk-awareness a decisive factor. "
            f"{winner.algorithm_name} had only {winner.total_risk_incidents} risk incidents "
            f"vs the average across all algorithms."
        )

    return " ".join(parts)


def _build_deployment_notes(winner, sv_config):
    notes = []

    if winner.algorithm_id == "risk_adjusted":
        notes.append("Deploy with risk penalty calibrated to regulatory requirements. "
                      "Monitor false positive rate on risk flagging to avoid over-filtering.")
    elif winner.algorithm_id == "hybrid_ensemble":
        notes.append("Deploy with adaptive weights: increase GBDT weight for high-trust "
                      "sub-verticals, increase Bandit weight for new product launches.")
    elif winner.algorithm_id == "gbdt":
        notes.append("Deploy with feature store integration for real-time credit/income "
                      "features. Retrain weekly to capture market condition shifts.")
    elif winner.algorithm_id == "dlrm":
        notes.append("Deploy with warm-start from GBDT predictions for cold segments. "
                      "Monitor cold-start degradation and fallback to Two-Tower if needed.")
    elif winner.algorithm_id == "bandit":
        notes.append("Deploy with exploration budget cap (10-15% of traffic). "
                      "Pair with GBDT as exploitation arm for hybrid strategy.")
    else:
        notes.append("Deploy with quality monitoring dashboard tracking CTR, CVR, "
                      "and risk incident rate per sub-vertical.")

    if sv_config["trust_sensitivity"] > 0.8:
        notes.append("High trust sensitivity requires gradual rollout with user "
                      "sentiment monitoring. Start with 10% traffic and ramp.")

    notes.append(f"Target latency budget: <{winner.avg_latency * 1.5:.0f}ms p95. "
                 f"Current p50: {winner.avg_latency:.0f}ms.")

    return notes
