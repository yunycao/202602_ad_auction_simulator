"""
Ads Ranking Model — Production-Style Multi-Task Ranking Pipeline

Simulates a full ads ranking system with:
- Dense + sparse feature engineering with cross-feature interactions
- Multi-task prediction (pCTR, pCVR, pEngagement, pNegative)
- Platt scaling calibration
- eCPM-based ranking with quality controls and diversity injection
- Ablation study framework for component-level impact analysis
"""
from __future__ import annotations

import math
import hashlib
from dataclasses import dataclass, field
from typing import Optional


# ─── Seeded PRNG (no numpy dependency) ───────────────────────────────

def _seeded_random(seed: int):
    """Deterministic PRNG using a simple LCG."""
    state = seed & 0xFFFFFFFF
    while True:
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        yield (state >> 16) / 65536.0


def _hash_seed(*args) -> int:
    """Stable hash from multiple keys."""
    h = hashlib.md5("|".join(str(a) for a in args).encode()).hexdigest()
    return int(h[:8], 16)


# ─── Feature Definitions ─────────────────────────────────────────────

# Dense features computed per (advertiser, segment, hour) tuple
DENSE_FEATURE_NAMES = [
    "bid_competitiveness",      # bid / median_bid
    "quality_score",            # raw quality score
    "budget_utilization",       # fraction of budget spent so far
    "historical_ctr",           # advertiser's historical CTR in segment
    "segment_affinity",         # targeting match quality
    "time_relevance",           # hour-of-day engagement multiplier
    "advertiser_tenure",        # proxy for data richness
    "ad_freshness",             # recency of creative
    "bid_to_reserve_ratio",     # bid headroom above reserve
    "vertical_competition",     # number of competitors in same vertical
]

# Sparse embedding dimensions (simulated)
EMBEDDING_DIM = 8

# Cross-feature interaction pairs
CROSS_FEATURE_PAIRS = [
    ("vertical_emb", "segment_emb"),     # vertical × segment interaction
    ("vertical_emb", "hour_emb"),        # vertical × time interaction
    ("segment_emb", "hour_emb"),         # segment × time interaction
]

# Feature importance ground truth (used for SHAP-style attribution)
FEATURE_IMPORTANCE_WEIGHTS = {
    "bid_competitiveness": 0.18,
    "quality_score": 0.16,
    "historical_ctr": 0.14,
    "segment_affinity": 0.12,
    "vertical×segment_cross": 0.10,
    "time_relevance": 0.07,
    "budget_utilization": 0.06,
    "advertiser_tenure": 0.05,
    "vertical×hour_cross": 0.04,
    "ad_freshness": 0.03,
    "segment×hour_cross": 0.03,
    "bid_to_reserve_ratio": 0.02,
}


# ─── Data Classes ─────────────────────────────────────────────────────

@dataclass
class FeatureVector:
    """Computed features for a single (advertiser, segment, hour) tuple."""
    advertiser_id: str
    dense_features: dict
    sparse_embeddings: dict          # name → list[float]
    cross_features: dict             # "a×b" → float (dot-product score)
    raw_feature_values: dict = field(default_factory=dict)


@dataclass
class PredictionResult:
    """Multi-task prediction output for a single ad candidate."""
    advertiser_id: str
    advertiser_name: str
    vertical: str
    bid: float
    # Multi-task predictions
    p_ctr: float
    p_cvr: float
    p_engagement: float
    p_negative: float
    # Derived scores
    ecpm: float
    quality_multiplier: float
    calibration_adj: float
    # Explainability
    feature_importance: dict
    rank: int = 0


@dataclass
class RankingResult:
    """Aggregated ranking outcome for a full ad request."""
    ranked_ads: list
    total_revenue: float
    avg_ctr: float
    avg_cvr: float
    avg_ecpm: float
    user_satisfaction: float         # engagement - negative weighted
    negative_feedback_rate: float
    calibration_error: float         # ECE
    fill_rate: float
    diversity_score: float           # 1 - HHI of verticals in top ads


@dataclass
class AblationResult:
    """Results for one ablation variant."""
    variant_id: str
    variant_name: str
    description: str
    ranking_result: RankingResult
    top_feature_importance: dict     # top 12 features
    calibration_curve: list          # [(predicted_bin, observed_rate), ...]
    revenue_lift_vs_random: float    # % lift over random baseline


@dataclass
class CalibrationPoint:
    """Single point on a calibration curve."""
    predicted_bin: float
    observed_rate: float
    count: int


# ─── Hourly Engagement Multipliers ────────────────────────────────────

HOURLY_ENGAGEMENT = [
    0.30, 0.20, 0.15, 0.12, 0.10, 0.18,   # 00-05 (night)
    0.40, 0.65, 0.82, 0.90, 0.88, 0.85,   # 06-11 (morning)
    0.78, 0.75, 0.80, 0.85, 0.90, 0.95,   # 12-17 (afternoon)
    1.00, 0.98, 0.92, 0.80, 0.60, 0.42,   # 18-23 (evening)
]


# ─── Feature Engineering ──────────────────────────────────────────────

def compute_features(advertiser, segment, hour: int, all_advertisers: list,
                     seed: int = 42) -> FeatureVector:
    """
    Compute dense features, sparse embeddings, and cross-feature interactions
    for a single (advertiser, segment, hour) tuple.
    """
    rng = _seeded_random(_hash_seed(advertiser.id, segment.id, hour, seed))

    # ── Dense features ──
    # Bid competitiveness: advertiser's bid relative to median
    median_bid = sorted(a.base_bid for a in all_advertisers)[len(all_advertisers) // 2]
    bid_comp = min(2.0, advertiser.base_bid / max(median_bid, 0.01))

    # Historical CTR: base from segment, modulated by quality
    hist_ctr = segment.avg_ctr * (0.6 + 0.8 * advertiser.quality_score) + (next(rng) - 0.5) * 0.005

    # Segment affinity: does advertiser target this segment?
    targets = getattr(advertiser, "target_segments", [])
    affinity = 0.9 if segment.id in targets else 0.4 + next(rng) * 0.2

    # Time relevance
    time_rel = HOURLY_ENGAGEMENT[hour % 24]

    # Budget utilization (simulated: higher at end of day)
    budget_util = min(1.0, (hour / 24.0) * 0.7 + next(rng) * 0.2)

    # Advertiser tenure (proxy from quality + noise)
    tenure = 0.3 + advertiser.quality_score * 0.5 + next(rng) * 0.2

    # Ad freshness (random, higher quality = fresher creative)
    freshness = 0.4 + advertiser.quality_score * 0.3 + next(rng) * 0.3

    # Bid to reserve ratio
    reserve = 0.50  # default reserve
    bid_reserve_ratio = min(3.0, advertiser.base_bid / max(reserve, 0.01))

    # Vertical competition
    same_vertical = sum(1 for a in all_advertisers
                        if getattr(a, "vertical", "") == getattr(advertiser, "vertical", ""))
    vert_competition = min(1.0, same_vertical / max(len(all_advertisers), 1))

    dense = {
        "bid_competitiveness": round(bid_comp, 4),
        "quality_score": round(advertiser.quality_score, 4),
        "budget_utilization": round(budget_util, 4),
        "historical_ctr": round(max(0, hist_ctr), 6),
        "segment_affinity": round(affinity, 4),
        "time_relevance": round(time_rel, 4),
        "advertiser_tenure": round(min(1.0, tenure), 4),
        "ad_freshness": round(min(1.0, freshness), 4),
        "bid_to_reserve_ratio": round(bid_reserve_ratio, 4),
        "vertical_competition": round(vert_competition, 4),
    }

    # ── Sparse Embeddings (simulated) ──
    def _make_embedding(key: str) -> list:
        r = _seeded_random(_hash_seed(key, seed))
        vec = [next(r) * 2 - 1 for _ in range(EMBEDDING_DIM)]
        norm = max(math.sqrt(sum(v * v for v in vec)), 1e-6)
        return [round(v / norm, 4) for v in vec]

    vertical = getattr(advertiser, "vertical", "unknown")
    sparse = {
        "vertical_emb": _make_embedding(f"v_{vertical}"),
        "segment_emb": _make_embedding(f"s_{segment.id}"),
        "hour_emb": _make_embedding(f"h_{hour}"),
    }

    # ── Cross-Feature Interactions (dot products) ──
    cross = {}
    for a_name, b_name in CROSS_FEATURE_PAIRS:
        a_vec = sparse[a_name]
        b_vec = sparse[b_name]
        dot = sum(x * y for x, y in zip(a_vec, b_vec))
        label = f"{a_name.split('_')[0]}×{b_name.split('_')[0]}"
        cross[label] = round(dot, 4)

    return FeatureVector(
        advertiser_id=advertiser.id,
        dense_features=dense,
        sparse_embeddings=sparse,
        cross_features=cross,
        raw_feature_values={**dense, **{f"{k}_cross": v for k, v in cross.items()}},
    )


# ─── Multi-Task Prediction ────────────────────────────────────────────

def predict_multitask(
    features: FeatureVector,
    advertiser,
    segment,
    variant: str = "full",
    seed: int = 42,
) -> PredictionResult:
    """
    Simulate multi-task prediction with configurable ablations.

    Variants:
      - "full": all features + multi-task + calibration
      - "no_calibration": raw scores, skip Platt scaling
      - "single_task": pCTR only, no auxiliary tasks
      - "no_cross_features": remove embedding interactions
      - "random": random ranking baseline
    """
    rng = _seeded_random(_hash_seed(features.advertiser_id, segment.id, variant, seed))
    d = features.dense_features
    cx = features.cross_features

    if variant == "random":
        return PredictionResult(
            advertiser_id=features.advertiser_id,
            advertiser_name=getattr(advertiser, "name", features.advertiser_id),
            vertical=getattr(advertiser, "vertical", "unknown"),
            bid=advertiser.base_bid,
            p_ctr=next(rng) * 0.08,
            p_cvr=next(rng) * 0.03,
            p_engagement=next(rng),
            p_negative=next(rng) * 0.15,
            ecpm=next(rng) * 5.0,
            quality_multiplier=1.0,
            calibration_adj=0.0,
            feature_importance={},
        )

    # ── Shared Bottom Layer (feature combination) ──
    # Dense signal: weighted combination of normalized dense features
    dense_signal = (
        d["bid_competitiveness"] * 0.20
        + d["quality_score"] * 0.25
        + d["historical_ctr"] * 15.0   # amplify small CTR values
        + d["segment_affinity"] * 0.15
        + d["time_relevance"] * 0.10
        + d["budget_utilization"] * (-0.05)  # overspend = negative signal
        + d["advertiser_tenure"] * 0.08
        + d["ad_freshness"] * 0.05
    )

    # Cross-feature signal
    if variant == "no_cross_features":
        cross_signal = 0.0
    else:
        cross_signal = sum(cx.values()) * 0.15

    base_score = dense_signal + cross_signal

    # ── Task-Specific Towers ──
    noise = lambda scale=0.02: (next(rng) - 0.5) * scale

    # pCTR tower
    raw_ctr = _sigmoid(base_score * 0.8 + d["historical_ctr"] * 8.0 + noise(0.03))
    raw_ctr = max(0.001, min(0.15, raw_ctr))

    if variant == "single_task":
        # Single-task: only pCTR, estimate others naively
        raw_cvr = raw_ctr * 0.3 + noise(0.01)
        raw_engagement = 0.5
        raw_negative = 0.05
    else:
        # pCVR tower (harder task, sparser signal)
        raw_cvr = _sigmoid(base_score * 0.5 + d["quality_score"] * 0.3 + noise(0.04))
        raw_cvr = max(0.0005, min(0.08, raw_cvr * 0.4))

        # pEngagement tower
        raw_engagement = _sigmoid(
            d["quality_score"] * 0.4 + d["segment_affinity"] * 0.3
            + d["ad_freshness"] * 0.2 + cross_signal * 0.3 + noise(0.05)
        )

        # pNegative tower (lower is better)
        raw_negative = _sigmoid(
            (1 - d["quality_score"]) * 0.5
            + (1 - d["segment_affinity"]) * 0.3
            + d["budget_utilization"] * 0.1  # aggressive spending → spammy
            + noise(0.03)
        ) * 0.15  # cap at 15%

    # ── Calibration ──
    if variant == "no_calibration":
        p_ctr = raw_ctr
        p_cvr = raw_cvr
        cal_adj = 0.0
    else:
        # Platt scaling: calibrate toward observed rates
        p_ctr, cal_adj_ctr = _platt_calibrate(raw_ctr, segment.avg_ctr, seed)
        p_cvr, cal_adj_cvr = _platt_calibrate(raw_cvr, segment.avg_cvr * 0.5, seed + 1)
        cal_adj = (cal_adj_ctr + cal_adj_cvr) / 2

    # ── Quality Multiplier ──
    engagement_bonus = raw_engagement * 0.15         # up to +15% for high engagement
    negative_penalty = raw_negative * (-0.30)        # up to -30% for high negative
    quality_mult = max(0.5, 1.0 + engagement_bonus + negative_penalty)

    # ── eCPM Scoring ──
    ecpm = advertiser.base_bid * p_ctr * max(p_cvr, 0.01) * quality_mult * 1000

    # ── Feature Importance (SHAP-style attribution) ──
    importance = _compute_attribution(features, variant, seed)

    return PredictionResult(
        advertiser_id=features.advertiser_id,
        advertiser_name=getattr(advertiser, "name", features.advertiser_id),
        vertical=getattr(advertiser, "vertical", "unknown"),
        bid=advertiser.base_bid,
        p_ctr=round(p_ctr, 6),
        p_cvr=round(p_cvr, 6),
        p_engagement=round(raw_engagement, 4),
        p_negative=round(raw_negative, 4),
        ecpm=round(ecpm, 4),
        quality_multiplier=round(quality_mult, 4),
        calibration_adj=round(cal_adj, 6),
        feature_importance=importance,
    )


def _sigmoid(x: float) -> float:
    """Numerically stable sigmoid."""
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    else:
        z = math.exp(x)
        return z / (1.0 + z)


def _platt_calibrate(raw_score: float, target_rate: float,
                     seed: int = 42) -> tuple:
    """
    Platt scaling: adjust raw prediction toward observed base rate.
    Returns (calibrated_score, adjustment_delta).
    """
    # Platt parameters: log-odds shift toward target
    raw_logit = math.log(max(raw_score, 1e-6) / max(1 - raw_score, 1e-6))
    target_logit = math.log(max(target_rate, 1e-6) / max(1 - target_rate, 1e-6))

    # Weighted blend: 70% model, 30% base rate (conservative calibration)
    calibrated_logit = raw_logit * 0.70 + target_logit * 0.30
    calibrated = _sigmoid(calibrated_logit)

    return round(calibrated, 6), round(calibrated - raw_score, 6)


def _compute_attribution(features: FeatureVector, variant: str,
                         seed: int) -> dict:
    """Compute SHAP-style feature importance scores."""
    rng = _seeded_random(_hash_seed(features.advertiser_id, "attr", seed))
    importance = {}

    for feat_name, base_weight in FEATURE_IMPORTANCE_WEIGHTS.items():
        if variant == "no_cross_features" and "cross" in feat_name:
            importance[feat_name] = 0.0
            continue
        # Add noise to base importance
        noise = (next(rng) - 0.5) * 0.03
        importance[feat_name] = round(max(0, base_weight + noise), 4)

    # Normalize
    total = sum(importance.values()) or 1
    return {k: round(v / total, 4) for k, v in importance.items()}


# ─── Ranking Pipeline ──────────────────────────────────────────────────

def rank_ads(
    predictions: list,
    slots: int = 5,
    quality_floor: float = 0.3,
    diversity_weight: float = 0.1,
    max_per_vertical: int = 3,
) -> RankingResult:
    """
    Full ranking pipeline:
    1. Quality filter (drop below quality_floor)
    2. Sort by eCPM
    3. Diversity injection (vertical diversification)
    4. Select top-k for slots
    5. Compute aggregate metrics
    """
    # ── Quality Filter ──
    filtered = [p for p in predictions
                if p.quality_multiplier >= 0.6 and p.p_negative < 0.10]

    # ── Sort by eCPM ──
    filtered.sort(key=lambda p: p.ecpm, reverse=True)

    # ── Diversity Injection ──
    if diversity_weight > 0:
        filtered = _diversify(filtered, max_per_vertical, diversity_weight)

    # ── Select Top-K ──
    winners = filtered[:slots]
    for i, w in enumerate(winners):
        w.rank = i + 1

    if not winners:
        return RankingResult(
            ranked_ads=[], total_revenue=0, avg_ctr=0, avg_cvr=0,
            avg_ecpm=0, user_satisfaction=0, negative_feedback_rate=0,
            calibration_error=0, fill_rate=0, diversity_score=0,
        )

    # ── Aggregate Metrics ──
    total_revenue = sum(w.ecpm / 1000 for w in winners)  # eCPM → per-impression
    avg_ctr = sum(w.p_ctr for w in winners) / len(winners)
    avg_cvr = sum(w.p_cvr for w in winners) / len(winners)
    avg_ecpm = sum(w.ecpm for w in winners) / len(winners)
    avg_engagement = sum(w.p_engagement for w in winners) / len(winners)
    avg_negative = sum(w.p_negative for w in winners) / len(winners)
    user_sat = avg_engagement * 0.7 - avg_negative * 0.3

    # Calibration error (ECE approximation)
    cal_errors = [abs(w.calibration_adj) for w in winners]
    ece = sum(cal_errors) / len(cal_errors) if cal_errors else 0

    # Diversity: 1 - HHI of verticals
    vert_counts = {}
    for w in winners:
        vert_counts[w.vertical] = vert_counts.get(w.vertical, 0) + 1
    hhi = sum((c / len(winners)) ** 2 for c in vert_counts.values())
    diversity = round(1.0 - hhi, 4)

    fill_rate = min(1.0, len(winners) / max(slots, 1))

    return RankingResult(
        ranked_ads=winners,
        total_revenue=round(total_revenue, 4),
        avg_ctr=round(avg_ctr, 6),
        avg_cvr=round(avg_cvr, 6),
        avg_ecpm=round(avg_ecpm, 4),
        user_satisfaction=round(user_sat, 4),
        negative_feedback_rate=round(avg_negative, 4),
        calibration_error=round(ece, 6),
        fill_rate=round(fill_rate, 4),
        diversity_score=diversity,
    )


def _diversify(ranked: list, max_per_vertical: int, weight: float) -> list:
    """Re-rank to ensure vertical diversity while preserving most of eCPM ordering."""
    vert_counts = {}
    result = []
    deferred = []

    for p in ranked:
        count = vert_counts.get(p.vertical, 0)
        if count < max_per_vertical:
            result.append(p)
            vert_counts[p.vertical] = count + 1
        else:
            deferred.append(p)

    # Append deferred items at the end (may still be selected if slots remain)
    result.extend(deferred)
    return result


# ─── Calibration Curve ──────────────────────────────────────────────

def compute_calibration_curve(predictions: list,
                              num_bins: int = 10) -> list:
    """
    Compute reliability diagram data: group predictions into bins,
    compute observed rate per bin.
    """
    if not predictions:
        return []

    # Sort by pCTR
    sorted_preds = sorted(predictions, key=lambda p: p.p_ctr)

    # Bin edges
    bin_size = max(1, len(sorted_preds) // num_bins)
    curve = []

    for i in range(0, len(sorted_preds), bin_size):
        bucket = sorted_preds[i:i + bin_size]
        avg_pred = sum(p.p_ctr for p in bucket) / len(bucket)
        # "Observed" rate: use quality-adjusted CTR as ground truth proxy
        avg_obs = sum(
            p.p_ctr * (0.85 + 0.30 * p.quality_multiplier)  # simulate actual CTR
            for p in bucket
        ) / len(bucket)
        curve.append({
            "predicted": round(avg_pred, 4),
            "observed": round(avg_obs, 4),
            "count": len(bucket),
        })

    return curve


# ─── Ablation Study Engine ──────────────────────────────────────────

ABLATION_VARIANTS = [
    ("full", "Full Model",
     "All features + multi-task prediction + calibration + quality controls"),
    ("no_calibration", "No Calibration",
     "Skip Platt scaling — raw model scores used directly for eCPM"),
    ("single_task", "Single-Task (pCTR Only)",
     "Only predict click probability — no auxiliary pCVR/engagement/negative tasks"),
    ("no_cross_features", "No Cross-Features",
     "Remove embedding interaction terms — additive features only"),
    ("random", "Random Baseline",
     "Random ranking for reference — no ML model"),
]


def run_ablation_study(
    advertisers: list,
    segment,
    hour: int = 14,
    slots: int = 8,
    num_candidates: int = 50,
    diversity_weight: float = 0.1,
    seed: int = 42,
) -> dict:
    """
    Run the full ranking pipeline across all ablation variants.
    Returns results per variant plus cross-variant comparisons.
    """
    # Select candidates (top by quality × bid)
    eligible = [a for a in advertisers
                if segment.id in getattr(a, "target_segments", [])]
    if len(eligible) < num_candidates:
        eligible = advertisers[:num_candidates]
    eligible = sorted(eligible, key=lambda a: a.quality_score * a.base_bid,
                      reverse=True)[:num_candidates]

    results = {}
    random_revenue = None

    for variant_id, variant_name, variant_desc in ABLATION_VARIANTS:
        # Compute features for all candidates
        features_list = [
            compute_features(a, segment, hour, eligible, seed)
            for a in eligible
        ]

        # Run multi-task prediction
        predictions = [
            predict_multitask(f, a, segment, variant=variant_id, seed=seed)
            for f, a in zip(features_list, eligible)
        ]

        # Rank and select winners
        ranking = rank_ads(predictions, slots=slots,
                           diversity_weight=diversity_weight)

        # Calibration curve
        cal_curve = compute_calibration_curve(predictions)

        # Feature importance (aggregate across candidates)
        agg_importance = _aggregate_importance(predictions)

        # Track random baseline revenue
        if variant_id == "random":
            random_revenue = ranking.total_revenue

        results[variant_id] = AblationResult(
            variant_id=variant_id,
            variant_name=variant_name,
            description=variant_desc,
            ranking_result=ranking,
            top_feature_importance=agg_importance,
            calibration_curve=cal_curve,
            revenue_lift_vs_random=0.0,  # computed below
        )

    # Compute revenue lift vs random
    if random_revenue and random_revenue > 0:
        for v_id, ar in results.items():
            ar.revenue_lift_vs_random = round(
                (ar.ranking_result.total_revenue / random_revenue - 1) * 100, 2
            )

    # ── Revenue Waterfall ──
    waterfall = _compute_revenue_waterfall(results)

    # ── Summary ──
    return {
        "variants": {
            v_id: _ablation_to_dict(ar) for v_id, ar in results.items()
        },
        "revenue_waterfall": waterfall,
        "segment_id": segment.id,
        "segment_name": segment.name,
        "hour": hour,
        "num_candidates": len(eligible),
        "num_slots": slots,
    }


def _aggregate_importance(predictions: list) -> dict:
    """Average feature importance across all predictions."""
    if not predictions:
        return {}
    agg = {}
    count = 0
    for p in predictions:
        if not p.feature_importance:
            continue
        count += 1
        for k, v in p.feature_importance.items():
            agg[k] = agg.get(k, 0) + v

    if count == 0:
        return {}
    return {k: round(v / count, 4)
            for k, v in sorted(agg.items(), key=lambda x: -x[1])[:12]}


def _compute_revenue_waterfall(results: dict) -> list:
    """
    Compute incremental revenue contribution of each model component.
    Waterfall: random → +features → +cross-features → +multi-task → +calibration → full
    """
    def _rev(vid): return results[vid].ranking_result.total_revenue if vid in results else 0

    random_rev = _rev("random")
    no_cross_rev = _rev("no_cross_features")
    single_task_rev = _rev("single_task")
    no_cal_rev = _rev("no_calibration")
    full_rev = _rev("full")

    waterfall = [
        {"stage": "Random Baseline", "revenue": round(random_rev, 4),
         "incremental": 0, "color": "#9ca3af"},
        {"stage": "+ Dense Features", "revenue": round(no_cross_rev, 4),
         "incremental": round(no_cross_rev - random_rev, 4), "color": "#2563eb"},
        {"stage": "+ Cross-Features", "revenue": round(single_task_rev, 4),
         "incremental": round(single_task_rev - no_cross_rev, 4), "color": "#7c3aed"},
        {"stage": "+ Multi-Task", "revenue": round(no_cal_rev, 4),
         "incremental": round(no_cal_rev - single_task_rev, 4), "color": "#16a34a"},
        {"stage": "+ Calibration", "revenue": round(full_rev, 4),
         "incremental": round(full_rev - no_cal_rev, 4), "color": "#ea580c"},
    ]
    return waterfall


def _ablation_to_dict(ar: AblationResult) -> dict:
    """Serialize AblationResult for API response."""
    rr = ar.ranking_result
    return {
        "variant_id": ar.variant_id,
        "variant_name": ar.variant_name,
        "description": ar.description,
        "revenue": rr.total_revenue,
        "avg_ctr": rr.avg_ctr,
        "avg_cvr": rr.avg_cvr,
        "avg_ecpm": rr.avg_ecpm,
        "user_satisfaction": rr.user_satisfaction,
        "negative_feedback_rate": rr.negative_feedback_rate,
        "calibration_error": rr.calibration_error,
        "fill_rate": rr.fill_rate,
        "diversity_score": rr.diversity_score,
        "revenue_lift_vs_random": ar.revenue_lift_vs_random,
        "feature_importance": ar.top_feature_importance,
        "calibration_curve": ar.calibration_curve,
        "ranked_ads": [
            {
                "rank": p.rank,
                "advertiser_id": p.advertiser_id,
                "advertiser_name": p.advertiser_name,
                "vertical": p.vertical,
                "bid": p.bid,
                "p_ctr": p.p_ctr,
                "p_cvr": p.p_cvr,
                "p_engagement": p.p_engagement,
                "p_negative": p.p_negative,
                "ecpm": p.ecpm,
                "quality_multiplier": p.quality_multiplier,
            }
            for p in rr.ranked_ads
        ],
    }
