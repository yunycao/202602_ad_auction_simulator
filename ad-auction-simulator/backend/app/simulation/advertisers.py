"""
Synthetic advertiser generation with realistic bid landscapes.

Models a large-scale advertiser ecosystem:
  - Verticals with different bid distributions (finance bids higher than CPG)
  - Budget tiers (SMB vs enterprise)
  - Bid strategies reflecting real advertiser behavior
  - Quality scores correlated with vertical and budget
"""
import random
from ..auction.models import Advertiser, BidStrategy


VERTICALS = {
    "E-Commerce":     {"bid_mu": 2.5, "bid_sigma": 1.5, "quality_mu": 0.65, "budget_range": (1000, 25000)},
    "Gaming":         {"bid_mu": 3.0, "bid_sigma": 2.0, "quality_mu": 0.55, "budget_range": (2000, 40000)},
    "Finance":        {"bid_mu": 8.0, "bid_sigma": 4.0, "quality_mu": 0.70, "budget_range": (5000, 100000)},
    "Travel":         {"bid_mu": 4.0, "bid_sigma": 2.5, "quality_mu": 0.60, "budget_range": (1500, 30000)},
    "Health":         {"bid_mu": 5.0, "bid_sigma": 3.0, "quality_mu": 0.62, "budget_range": (2000, 35000)},
    "Entertainment":  {"bid_mu": 2.0, "bid_sigma": 1.2, "quality_mu": 0.58, "budget_range": (500, 15000)},
    "SaaS":           {"bid_mu": 6.5, "bid_sigma": 3.5, "quality_mu": 0.72, "budget_range": (3000, 60000)},
    "CPG":            {"bid_mu": 1.5, "bid_sigma": 0.8, "quality_mu": 0.50, "budget_range": (800, 20000)},
}

SEGMENT_IDS = [
    "young_tech", "suburban_parents", "luxury_shoppers", "college_students",
    "biz_professionals", "fitness_enthusiasts", "gamers", "retirees",
]

# Vertical-segment affinity matrix (probability of targeting each segment)
AFFINITY = {
    "E-Commerce":    [0.7, 0.8, 0.9, 0.6, 0.5, 0.4, 0.3, 0.5],
    "Gaming":        [0.8, 0.2, 0.1, 0.9, 0.2, 0.3, 0.95, 0.1],
    "Finance":       [0.5, 0.6, 0.8, 0.3, 0.9, 0.2, 0.1, 0.7],
    "Travel":        [0.6, 0.7, 0.8, 0.5, 0.7, 0.4, 0.2, 0.8],
    "Health":        [0.5, 0.7, 0.4, 0.4, 0.5, 0.9, 0.2, 0.7],
    "Entertainment": [0.8, 0.5, 0.3, 0.9, 0.4, 0.5, 0.8, 0.4],
    "SaaS":          [0.7, 0.3, 0.2, 0.4, 0.9, 0.1, 0.3, 0.1],
    "CPG":           [0.4, 0.9, 0.5, 0.6, 0.3, 0.6, 0.2, 0.7],
}


def generate_advertisers(
    count: int = 80,
    seed: int = 42,
) -> list[Advertiser]:
    """Generate a realistic set of synthetic advertisers."""
    rng = random.Random(seed)
    advertisers = []

    for i in range(count):
        vertical = rng.choice(list(VERTICALS.keys()))
        params = VERTICALS[vertical]
        affinities = AFFINITY[vertical]

        # Log-normal bid distribution (realistic: most bids are low, some very high)
        base_bid = max(0.1, rng.lognormvariate(
            mu=params["bid_mu"] / 3, sigma=params["bid_sigma"] / 3
        ))

        # Quality score: beta-distributed, correlated with vertical
        quality_score = min(1.0, max(0.1, rng.betavariate(
            alpha=params["quality_mu"] * 5,
            beta=(1 - params["quality_mu"]) * 5,
        )))

        # Budget: uniform within vertical range
        budget_lo, budget_hi = params["budget_range"]
        daily_budget = rng.uniform(budget_lo, budget_hi)

        # Target segments based on affinity matrix
        target_segments = [
            seg_id for seg_id, aff in zip(SEGMENT_IDS, affinities)
            if rng.random() < aff
        ]
        # Ensure at least one segment
        if not target_segments:
            target_segments = [rng.choice(SEGMENT_IDS)]

        strategy = rng.choice(list(BidStrategy))

        advertisers.append(Advertiser(
            id=f"adv_{i:03d}",
            name=f"{vertical} Advertiser {i + 1}",
            vertical=vertical,
            daily_budget=round(daily_budget, 2),
            quality_score=round(quality_score, 3),
            base_bid=round(base_bid, 2),
            target_segments=target_segments,
            strategy=strategy,
        ))

    return advertisers
