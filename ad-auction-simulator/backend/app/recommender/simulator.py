"""
Recommender model simulator.

Simulates the output characteristics of different ranking model architectures
used in large-scale ad serving stacks. Each model has different strengths:

  Two-Tower:  Fast retrieval, high coverage, moderate precision
  GBDT:       Strong on tabular features, high precision for warm segments
  DLRM:       Deep model, best overall but expensive, weak on cold-start
  Bandit:     Exploration-focused, high variance, best for new segments

The simulator produces realistic CTR/CVR prediction distributions per
model-segment pair, enabling analysis of how model choice affects auction
revenue and advertiser outcomes.
"""
import random
from typing import Optional
from dataclasses import dataclass
from ..auction.models import UserSegment


@dataclass
class ModelSpec:
    id: str
    name: str
    latency_ms: float        # p50 serving latency
    coverage: float          # fraction of candidates scored
    precision: float         # ranking quality for warm users
    cold_start_factor: float # performance multiplier on sparse data
    compute_cost: float      # relative cost per 1K inferences


MODELS = [
    ModelSpec("two_tower",  "Two-Tower Retrieval",  latency_ms=5,  coverage=0.95, precision=0.72, cold_start_factor=0.65, compute_cost=0.1),
    ModelSpec("gbdt",       "GBDT Ranker",          latency_ms=12, coverage=0.78, precision=0.88, cold_start_factor=0.45, compute_cost=0.3),
    ModelSpec("dlrm",       "DLRM Deep Model",      latency_ms=25, coverage=0.85, precision=0.92, cold_start_factor=0.38, compute_cost=1.0),
    ModelSpec("bandit",     "Contextual Bandit",    latency_ms=8,  coverage=0.82, precision=0.68, cold_start_factor=0.82, compute_cost=0.2),
]

MODEL_MAP = {m.id: m for m in MODELS}


@dataclass
class ModelPerformance:
    model_id: str
    model_name: str
    segment_id: str
    ctr_lift: float        # multiplicative lift over baseline CTR
    cvr_lift: float        # multiplicative lift over baseline CVR
    revenue_lift: float    # net revenue impact (lift * coverage)
    latency_cost_ms: float # effective latency for this segment
    compute_cost: float


def simulate_model_performance(
    model: ModelSpec,
    segment: UserSegment,
    seed: int = 1,
) -> ModelPerformance:
    """
    Simulate a model's performance on a specific user segment.

    The simulation accounts for:
    1. Segment data density (larger segments = warmer data = better performance)
    2. Model's inherent precision and coverage characteristics
    3. Cold-start degradation for small segments
    4. Stochastic noise to reflect real-world variance
    """
    rng = random.Random(seed + hash(segment.id) + hash(model.id))

    # Data density: larger segments have more training data
    data_density = min(1.0, segment.size / 4_000_000)

    # Base lift from model precision, adjusted for data availability
    if data_density > 0.5:
        base_lift = model.precision * 1.1  # warm segment bonus
    else:
        base_lift = model.precision * model.cold_start_factor

    # Add realistic noise (±15%)
    noise = (rng.random() - 0.5) * 0.3
    ctr_lift = max(0.5, base_lift * (1 + noise))

    # CVR lift is correlated but noisier
    cvr_noise = (rng.random() - 0.5) * 0.4
    cvr_lift = max(0.4, ctr_lift * (0.85 + cvr_noise * 0.3))

    # Revenue lift accounts for coverage
    revenue_lift = ctr_lift * model.coverage

    # Latency increases for sparse segments (more cache misses)
    latency = model.latency_ms * (1 + (1 - data_density) * 0.4)

    return ModelPerformance(
        model_id=model.id,
        model_name=model.name,
        segment_id=segment.id,
        ctr_lift=round(ctr_lift, 3),
        cvr_lift=round(cvr_lift, 3),
        revenue_lift=round(revenue_lift, 3),
        latency_cost_ms=round(latency, 1),
        compute_cost=model.compute_cost,
    )


def simulate_all_models(
    segment: UserSegment,
    seed: int = 1,
) -> list[ModelPerformance]:
    """Run all models on a segment and return sorted by revenue lift."""
    results = [simulate_model_performance(m, segment, seed) for m in MODELS]
    return sorted(results, key=lambda r: r.revenue_lift, reverse=True)


def get_model(model_id: str) -> Optional[ModelSpec]:
    return MODEL_MAP.get(model_id)
