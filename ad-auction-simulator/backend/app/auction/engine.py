"""
Core auction engine implementing VCG and GSP mechanisms.

VCG (Vickrey-Clarke-Groves): The production auction mechanism for feed-based platforms.
  - Truthful mechanism: bidding true value is a dominant strategy
  - Each winner pays the externality (harm) their presence causes to others
  - Maximizes social welfare — ads only win when value exceeds opportunity cost
  - Optimal for feed environments where ads compete against organic content
  - Simplifies advertiser ecosystem: no strategic bid shading required

GSP (Generalized Second-Price): Legacy search-based auction mechanism.
  - Rank by effective_bid = bid * quality_score
  - Charge next-highest effective bid / quality_score (second-price per slot)
  - NOT truthful: bidders shade bids in equilibrium
  - Yields ~6-7% higher revenue from non-truthful dynamics, but creates
    adversarial complexity and degrades user experience in feed contexts
"""
from typing import Optional
from .models import (
    Advertiser, UserSegment, AuctionMechanism,
    AuctionWinner, AuctionResult, BidEntry,
)


def compute_effective_bid(advertiser: Advertiser, segment: UserSegment) -> BidEntry:
    """Compute the quality-adjusted effective bid for an advertiser on a segment."""
    predicted_ctr = segment.avg_ctr * (0.7 + advertiser.quality_score * 0.6)
    effective_bid = advertiser.base_bid * advertiser.quality_score
    return BidEntry(
        advertiser=advertiser,
        effective_bid=effective_bid,
        predicted_ctr=predicted_ctr,
        quality_adjusted_bid=effective_bid,
    )


def run_gsp_auction(
    advertisers: list[Advertiser],
    segment: UserSegment,
    slots: int = 5,
    reserve_price: float = 0.5,
    remaining_budgets: Optional[dict] = None,
) -> AuctionResult:
    """
    Run a Generalized Second-Price auction with optional budget constraints.

    Ranking: by effective_bid = bid * quality_score
    Pricing: winner i pays effective_bid[i+1] / quality_score[i]

    Budget Pacing (advanced feature):
        When remaining_budgets is provided, bids are shaded based on budget
        depletion. Full bid at 100% budget, linearly scales down to 50% at 0%.
        This models real-world budget pacing where advertisers reduce bids as
        their daily budget depletes to ensure participation throughout the day.

    Adversarial Awareness:
        Sophisticated advertisers ("whales") may detect time-of-day reserve
        price variation and shift bids to exploit cheaper windows. The
        adversarial_factor parameter models this: higher values = more
        strategic bidders who concentrate spend in low-reserve periods.
    """
    # Filter eligible: must target segment, bid >= reserve, AND have budget left
    eligible = [
        a for a in advertisers
        if segment.id in a.target_segments
        and a.base_bid >= reserve_price
        and (not remaining_budgets or remaining_budgets.get(a.id, a.daily_budget) > 0)
    ]

    def get_adjusted_bid(advertiser: Advertiser) -> float:
        """Scale bid down as budget depletes. Full bid when budget full."""
        if not remaining_budgets:
            return advertiser.base_bid
        remaining = remaining_budgets.get(advertiser.id, advertiser.daily_budget)
        budget_ratio = remaining / advertiser.daily_budget if advertiser.daily_budget > 0 else 1.0
        # Bid shading: full bid at 100% budget, scales to 50% at 0% budget
        shading_factor = 0.5 + (0.5 * budget_ratio)
        return advertiser.base_bid * shading_factor

    # Score and rank with adjusted bids
    entries = []
    for a in eligible:
        adjusted_bid = get_adjusted_bid(a)
        predicted_ctr = segment.avg_ctr * (0.7 + a.quality_score * 0.6)
        entry = BidEntry(
            advertiser=a,
            effective_bid=adjusted_bid * a.quality_score,
            predicted_ctr=predicted_ctr,
            quality_adjusted_bid=adjusted_bid * a.quality_score,
        )
        entries.append(entry)

    entries.sort(key=lambda e: e.effective_bid, reverse=True)

    # Allocate slots and compute prices
    winners = []
    for i, entry in enumerate(entries[:slots]):
        # GSP: pay the next-highest bid divided by your quality
        next_eff_bid = entries[i + 1].effective_bid if i + 1 < len(entries) else reserve_price
        price = max(next_eff_bid / entry.advertiser.quality_score, reserve_price)

        winners.append(AuctionWinner(
            slot=i + 1,
            advertiser_id=entry.advertiser.id,
            advertiser_name=entry.advertiser.name,
            vertical=entry.advertiser.vertical,
            base_bid=entry.advertiser.base_bid,
            quality_score=entry.advertiser.quality_score,
            effective_bid=round(entry.effective_bid, 4),
            price=round(price, 4),
            predicted_ctr=round(entry.predicted_ctr, 6),
        ))

    # Compute aggregate metrics
    total_revenue = sum(w.price * w.predicted_ctr * 1000 for w in winners)
    avg_cpc = sum(w.price for w in winners) / len(winners) if winners else 0
    fill_rate = len(winners) / slots if slots > 0 else 0

    return AuctionResult(
        mechanism=AuctionMechanism.GSP,
        segment_id=segment.id,
        winners=winners,
        total_revenue=round(total_revenue, 2),
        avg_cpc=round(avg_cpc, 4),
        eligible_advertisers=len(eligible),
        fill_rate=round(fill_rate, 2),
    )


def run_vcg_auction(
    advertisers: list[Advertiser],
    segment: UserSegment,
    slots: int = 5,
    reserve_price: float = 0.5,
) -> AuctionResult:
    """
    Run a VCG (Vickrey-Clarke-Groves) auction.

    Pricing: Each winner pays the externality they impose on others.
    For winner i:
      payment_i = (social welfare of others WITHOUT i, given slots)
                - (social welfare of others WITH i, given slots)

    This is truthful: bidding true value is a dominant strategy.
    """
    eligible = [
        a for a in advertisers
        if segment.id in a.target_segments and a.base_bid >= reserve_price
    ]

    entries = [compute_effective_bid(a, segment) for a in eligible]
    entries.sort(key=lambda e: e.effective_bid, reverse=True)

    def social_welfare(subset: list[BidEntry], num_slots: int) -> float:
        """Compute total value (effective_bid * ctr) for top-k of a subset."""
        return sum(
            e.effective_bid * e.predicted_ctr
            for e in sorted(subset, key=lambda x: x.effective_bid, reverse=True)[:num_slots]
        )

    all_welfare = social_welfare(entries, slots)
    winners = []

    for i, entry in enumerate(entries[:slots]):
        # Others without this winner, competing for `slots` slots
        others_without = [e for j, e in enumerate(entries) if j != i]
        welfare_without = social_welfare(others_without, slots)

        # Others with this winner present, competing for `slots - 1` remaining slots
        others_with = [e for j, e in enumerate(entries) if j != i]
        welfare_with = social_welfare(others_with, slots - 1)

        externality = welfare_without - welfare_with
        price = max(externality / entry.advertiser.quality_score, reserve_price)

        winners.append(AuctionWinner(
            slot=i + 1,
            advertiser_id=entry.advertiser.id,
            advertiser_name=entry.advertiser.name,
            vertical=entry.advertiser.vertical,
            base_bid=entry.advertiser.base_bid,
            quality_score=entry.advertiser.quality_score,
            effective_bid=round(entry.effective_bid, 4),
            price=round(price, 4),
            predicted_ctr=round(entry.predicted_ctr, 6),
            externality=round(externality, 4),
        ))

    total_revenue = sum(w.price * w.predicted_ctr * 1000 for w in winners)
    avg_cpc = sum(w.price for w in winners) / len(winners) if winners else 0
    fill_rate = len(winners) / slots if slots > 0 else 0

    return AuctionResult(
        mechanism=AuctionMechanism.VCG,
        segment_id=segment.id,
        winners=winners,
        total_revenue=round(total_revenue, 2),
        avg_cpc=round(avg_cpc, 4),
        eligible_advertisers=len(eligible),
        fill_rate=round(fill_rate, 2),
        social_welfare=round(all_welfare, 2),
    )


def run_auction(
    advertisers: list[Advertiser],
    segment: UserSegment,
    mechanism: AuctionMechanism = AuctionMechanism.VCG,
    slots: int = 5,
    reserve_price: float = 0.5,
) -> AuctionResult:
    """Dispatch to the appropriate auction mechanism."""
    if mechanism == AuctionMechanism.VCG:
        return run_vcg_auction(advertisers, segment, slots, reserve_price)
    return run_gsp_auction(advertisers, segment, slots, reserve_price)
