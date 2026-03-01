"""
Segment-to-model routing logic.

Determines which recommender model to serve for each user segment,
balancing precision, latency, and exploration needs.

Routing factors:
  1. Data density — cold segments need exploration-friendly models
  2. Latency budget — feed vs stories vs reels have different budgets
  3. Revenue sensitivity — high-RPM segments get the expensive model
  4. Exploration quota — reserve 5-10% of traffic for contextual bandits
"""
from dataclasses import dataclass
from ..auction.models import UserSegment
from .simulator import MODELS, ModelSpec, simulate_all_models


@dataclass
class RoutingDecision:
    segment_id: str
    segment_name: str
    recommended_model: str
    model_name: str
    reason: str
    revenue_lift: float
    latency_ms: float
    alternatives: list[dict]


# Latency budgets by surface (milliseconds)
SURFACE_LATENCY_BUDGETS = {
    "feed": 30,
    "stories": 50,
    "reels": 40,
    "marketplace": 60,
}

EXPLORATION_RATE = 0.08  # 8% of traffic goes to bandit for exploration


def route_segment(
    segment: UserSegment,
    surface: str = "feed",
    seed: int = 1,
) -> RoutingDecision:
    """
    Decide the best model for a segment on a given surface.

    Decision logic:
    1. If segment is cold (size < 1.5M), prefer bandit or two-tower
    2. If latency budget is tight, exclude DLRM
    3. Otherwise, pick highest revenue_lift model within budget
    """
    latency_budget = SURFACE_LATENCY_BUDGETS.get(surface, 40)
    results = simulate_all_models(segment, seed)
    data_density = min(1.0, segment.size / 4_000_000)

    # Cold segment routing
    if data_density < 0.35:
        cold_friendly = [r for r in results if r.model_id in ("bandit", "two_tower")]
        best = cold_friendly[0] if cold_friendly else results[0]
        reason = f"Cold segment (density={data_density:.2f}): {best.model_name} has strong cold-start handling"
    # Latency-constrained routing
    elif any(r.latency_cost_ms > latency_budget for r in results[:1]):
        within_budget = [r for r in results if r.latency_cost_ms <= latency_budget]
        if within_budget:
            best = within_budget[0]
            reason = f"Latency-constrained ({surface}: {latency_budget}ms budget): {best.model_name} fits within SLA"
        else:
            best = min(results, key=lambda r: r.latency_cost_ms)
            reason = f"All models exceed budget; {best.model_name} has lowest latency"
    else:
        best = results[0]
        reason = f"Warm segment, budget OK: {best.model_name} maximizes revenue lift ({best.revenue_lift:.3f})"

    alternatives = [
        {
            "model": r.model_name,
            "revenue_lift": r.revenue_lift,
            "latency_ms": r.latency_cost_ms,
            "within_budget": r.latency_cost_ms <= latency_budget,
        }
        for r in results if r.model_id != best.model_id
    ]

    return RoutingDecision(
        segment_id=segment.id,
        segment_name=segment.name,
        recommended_model=best.model_id,
        model_name=best.model_name,
        reason=reason,
        revenue_lift=best.revenue_lift,
        latency_ms=best.latency_cost_ms,
        alternatives=alternatives,
    )


def route_all_segments(
    segments: list[UserSegment],
    surface: str = "feed",
    seed: int = 1,
) -> list[RoutingDecision]:
    """Route all segments and return decisions."""
    return [route_segment(seg, surface, seed) for seg in segments]
