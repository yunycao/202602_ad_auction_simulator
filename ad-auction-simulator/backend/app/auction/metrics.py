"""
Auction performance metrics aligned with ad platform monetization KPIs.

Key metrics for monetization systems:
  - Revenue per mille (RPM): revenue per 1000 impressions
  - Advertiser surplus: value captured by advertisers beyond what they pay
  - Social welfare: total value generated (surplus + revenue)
  - Auction efficiency: ratio of actual welfare to optimal welfare
  - Fill rate: fraction of slots filled
  - Bid density: competitive pressure per slot
"""
from .models import Advertiser, AuctionResult, AuctionWinner


def compute_rpm(result: AuctionResult, impressions: int = 1000) -> float:
    """Revenue per 1000 impressions."""
    if impressions == 0:
        return 0.0
    return round(result.total_revenue / (impressions / 1000), 4)


def compute_advertiser_surplus(result: AuctionResult) -> float:
    """
    Total surplus = sum of (value - price) for each winner.
    Value is approximated as effective_bid (what they're willing to pay).
    """
    surplus = sum(
        max(w.effective_bid - w.price, 0) * w.predicted_ctr * 1000
        for w in result.winners
    )
    return round(surplus, 2)


def compute_social_welfare(result: AuctionResult) -> float:
    """Total value created: revenue + advertiser surplus."""
    revenue = result.total_revenue
    surplus = compute_advertiser_surplus(result)
    return round(revenue + surplus, 2)


def compute_auction_efficiency(result: AuctionResult, optimal_welfare: float) -> float:
    """Ratio of actual social welfare to theoretical optimal (VCG) welfare."""
    actual = compute_social_welfare(result)
    if optimal_welfare == 0:
        return 0.0
    return round(actual / optimal_welfare, 4)


def compute_bid_density(result: AuctionResult, slots: int = 5) -> float:
    """Average number of eligible advertisers per slot."""
    if slots == 0:
        return 0.0
    return round(result.eligible_advertisers / slots, 2)


def compute_price_dispersion(result: AuctionResult) -> dict:
    """Price statistics across winners."""
    if not result.winners:
        return {"min": 0, "max": 0, "mean": 0, "spread": 0}
    prices = [w.price for w in result.winners]
    mean_p = sum(prices) / len(prices)
    return {
        "min": round(min(prices), 4),
        "max": round(max(prices), 4),
        "mean": round(mean_p, 4),
        "spread": round(max(prices) - min(prices), 4),
    }


def update_quality_score(
    advertiser: Advertiser,
    actual_ctr: float,
    predicted_ctr: float,
    learning_rate: float = 0.05,
) -> float:
    """
    Update advertiser's quality score based on CTR prediction error.

    This implements the quality feedback loop — a critical concept:
    - If actual_ctr > predicted_ctr: quality increases (underestimated performance)
    - If actual_ctr < predicted_ctr: quality decreases (overestimated performance)

    Over multiple rounds, this creates "natural selection":
    - High-quality ads win more → more data → better pCTR → higher quality (virtuous cycle)
    - Low-quality ads lose → sparse data → stale pCTR → lower quality (death spiral)

    Understanding this feedback loop is essential for equilibrium analysis in
    monetization systems. It determines advertiser population dynamics.

    Args:
        advertiser: Advertiser whose quality to update
        actual_ctr: Observed CTR from impressions shown
        predicted_ctr: CTR predicted before showing ads
        learning_rate: Adjustment speed (0.05 = 5% per observation)

    Returns:
        Updated quality score (clipped to [0.1, 1.0])
    """
    error = actual_ctr - predicted_ctr
    adjustment = error * learning_rate
    new_quality = advertiser.quality_score + adjustment
    return max(0.1, min(1.0, new_quality))


def full_metrics(result: AuctionResult, slots: int = 5) -> dict:
    """Compute all metrics for an auction result."""
    return {
        "mechanism": result.mechanism.value,
        "segment_id": result.segment_id,
        "total_revenue": result.total_revenue,
        "avg_cpc": result.avg_cpc,
        "rpm": compute_rpm(result),
        "advertiser_surplus": compute_advertiser_surplus(result),
        "social_welfare": compute_social_welfare(result),
        "fill_rate": result.fill_rate,
        "bid_density": compute_bid_density(result, slots),
        "eligible_advertisers": result.eligible_advertisers,
        "price_dispersion": compute_price_dispersion(result),
        "num_winners": len(result.winners),
    }
