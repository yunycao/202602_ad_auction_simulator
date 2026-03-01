"""
Bid landscape modeling for parameter sweeps and sensitivity analysis.

Generates bid curves and competitive landscapes used in what-if analysis:
  - Reserve price sweeps
  - Budget distribution analysis
  - Competitive density by segment
"""
from ..auction.models import Advertiser, UserSegment, AuctionMechanism
from ..auction.engine import run_auction


def reserve_price_sweep(
    advertisers: list[Advertiser],
    segment: UserSegment,
    mechanism: AuctionMechanism = AuctionMechanism.GSP,
    min_price: float = 0.1,
    max_price: float = 10.0,
    steps: int = 20,
    slots: int = 5,
) -> list[dict]:
    """Sweep reserve prices and compute revenue at each point."""
    step_size = (max_price - min_price) / (steps - 1)
    results = []
    for i in range(steps):
        rp = round(min_price + i * step_size, 2)
        result = run_auction(advertisers, segment, mechanism, slots, rp)
        results.append({
            "reserve_price": rp,
            "revenue": result.total_revenue,
            "avg_cpc": result.avg_cpc,
            "fill_rate": result.fill_rate,
            "eligible": result.eligible_advertisers,
            "winners": len(result.winners),
        })
    return results


def quality_floor_sweep(
    advertisers: list[Advertiser],
    segment: UserSegment,
    mechanism: AuctionMechanism = AuctionMechanism.GSP,
    steps: int = 10,
    slots: int = 5,
    reserve_price: float = 0.5,
) -> list[dict]:
    """Sweep quality score floors and measure impact."""
    results = []
    for i in range(steps + 1):
        qf = round(i / steps, 2)
        filtered = [a for a in advertisers if a.quality_score >= qf]
        result = run_auction(filtered, segment, mechanism, slots, reserve_price)
        results.append({
            "quality_floor": qf,
            "revenue": result.total_revenue,
            "remaining_advertisers": len(filtered),
            "fill_rate": result.fill_rate,
            "avg_cpc": result.avg_cpc,
        })
    return results


def competitive_landscape(
    advertisers: list[Advertiser],
    segments: list[UserSegment],
) -> list[dict]:
    """Analyze competitive density across segments."""
    return [
        {
            "segment_id": seg.id,
            "segment_name": seg.name,
            "eligible_advertisers": len([
                a for a in advertisers if seg.id in a.target_segments
            ]),
            "avg_bid": round(
                sum(a.base_bid for a in advertisers if seg.id in a.target_segments)
                / max(1, len([a for a in advertisers if seg.id in a.target_segments])),
                2,
            ),
            "avg_quality": round(
                sum(a.quality_score for a in advertisers if seg.id in a.target_segments)
                / max(1, len([a for a in advertisers if seg.id in a.target_segments])),
                3,
            ),
            "total_budget": round(
                sum(a.daily_budget for a in advertisers if seg.id in a.target_segments),
                2,
            ),
        }
        for seg in segments
    ]
