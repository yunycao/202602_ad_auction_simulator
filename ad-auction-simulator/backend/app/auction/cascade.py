"""
Cascade ranking architecture: retrieval -> ranking -> re-ranking.

Real ad systems cannot afford to run expensive models on millions of
candidates. Instead, they use a multi-stage cascade:

  Stage 1 - Retrieval (Two-Tower): Fast approximate nearest neighbor
    lookup. Reduces 1M+ candidates to ~100. O(log n) per query.

  Stage 2 - Ranking (DLRM/GBDT): Expensive model scoring on ~100
    candidates. Produces calibrated pCTR/pCVR. O(n) with large constant.

  Stage 3 - Re-ranking (Business Rules): Apply diversity constraints,
    frequency caps, budget limits. Reduces to final k winners.

Key insight: The cascade creates a compute-quality-latency tradeoff.
More candidates through expensive stages = better revenue but more
compute cost AND higher latency. A 100ms delay in ad rendering can
cause ~1% drop in total site conversions, which may outweigh revenue
gains from more complex models. The optimal cascade parameters depend
on marginal revenue vs. latency-induced conversion loss, which varies
by segment, surface, and advertiser competition level.
"""
import random
from typing import List, Optional
from .models import Advertiser, UserSegment, AuctionResult, AuctionMechanism
from .engine import run_gsp_auction


def two_tower_retrieval(
    advertisers: List[Advertiser],
    segment: UserSegment,
    k: int = 100,
    seed: int = 42,
) -> List[Advertiser]:
    """
    Stage 1: Fast retrieval using approximate matching.

    In production: Two-Tower model embeds users and ads into a shared
    vector space. FAISS/ScaNN finds k nearest neighbors in <5ms.

    Here: Filter to segment-targeting advertisers, then subsample if
    too many. This approximates the recall-precision tradeoff of
    approximate nearest neighbor retrieval.

    Compute cost: O(log n) per query — very cheap.
    """
    candidates = [a for a in advertisers if segment.id in a.target_segments]

    if len(candidates) > k:
        rng = random.Random(seed + hash(segment.id))
        # Weighted sampling: prefer higher-quality candidates (retrieval isn't random)
        weights = [a.quality_score + 0.1 for a in candidates]
        total = sum(weights)
        probs = [w / total for w in weights]

        selected = set()
        while len(selected) < k:
            r = rng.random()
            cumsum = 0
            for idx, p in enumerate(probs):
                cumsum += p
                if r <= cumsum and idx not in selected:
                    selected.add(idx)
                    break

        candidates = [candidates[i] for i in sorted(selected)]

    return candidates


def dlrm_ranking(
    candidates: List[Advertiser],
    segment: UserSegment,
    k: int = 20,
) -> List[Advertiser]:
    """
    Stage 2: Expensive model scoring.

    In production: DLRM computes dense embeddings + cross features
    to produce calibrated pCTR and pCVR predictions. ~25ms latency.

    Here: Score by quality × bid interaction (proxy for DLRM relevance).
    This captures the key property: expensive models produce better
    rankings than retrieval-stage approximations.

    Compute cost: O(n) with large constant — expensive per candidate.
    """
    scored = []
    for a in candidates:
        # Simulate DLRM scoring: quality × affinity × noise
        affinity = segment.avg_ctr * (0.7 + a.quality_score * 0.6)
        dlrm_score = a.quality_score * affinity * a.base_bid
        scored.append((a, dlrm_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [a for a, _ in scored[:k]]


def reranker(
    ranked: List[Advertiser],
    segment: UserSegment,
    k: int = 5,
    quality_floor: float = 0.35,
    max_per_vertical: int = 2,
) -> List[Advertiser]:
    """
    Stage 3: Business rules and diversity enforcement.

    In production: Re-ranking applies constraints that pure ML models
    don't capture:
    - Vertical diversity (don't show all gaming ads)
    - Frequency capping (limit ad exposure per user)
    - Brand safety (exclude inappropriate pairings)
    - SMB support (ensure small advertisers get some exposure)

    Here: Apply quality floor + vertical diversity constraints.

    Compute cost: O(n) with small constant — very cheap.
    """
    # Apply quality floor
    filtered = [a for a in ranked if a.quality_score >= quality_floor]

    # Enforce vertical diversity: max N from same vertical
    vertical_count: dict = {}
    final = []
    for a in filtered:
        v = a.vertical
        count = vertical_count.get(v, 0)
        if count < max_per_vertical:
            final.append(a)
            vertical_count[v] = count + 1
        if len(final) >= k:
            break

    return final


def run_cascade_auction(
    advertisers: List[Advertiser],
    segment: UserSegment,
    mechanism: AuctionMechanism = AuctionMechanism.GSP,
    slots: int = 5,
    reserve_price: float = 0.5,
    retrieval_k: int = 100,
    ranking_k: int = 20,
) -> dict:
    """
    Run full cascade pipeline and compare to single-stage auction.

    Cascade pipeline:
      All advertisers → Retrieval (k=100) → Ranking (k=20) → Re-ranking (k=5) → Auction

    Single-stage (baseline):
      All advertisers → Auction

    Returns detailed comparison including compute cost analysis.
    """
    # ── Cascade Pipeline ──
    # Stage 1: Retrieval
    retrieved = two_tower_retrieval(advertisers, segment, k=retrieval_k)

    # Stage 2: Ranking
    ranked = dlrm_ranking(retrieved, segment, k=ranking_k)

    # Stage 3: Re-ranking
    final_set = reranker(ranked, segment, k=max(slots * 3, 15))

    # Run auction on cascade output
    cascade_result = run_gsp_auction(final_set, segment, slots, reserve_price)

    # ── Single-Stage Baseline ──
    single_stage_result = run_gsp_auction(advertisers, segment, slots, reserve_price)

    # ── Compute Cost Analysis ──
    # Model compute costs (relative units per candidate):
    #   Retrieval (Two-Tower): 0.01 per candidate (ANN lookup)
    #   Ranking (DLRM): 1.0 per candidate (full forward pass)
    #   Re-ranking: 0.05 per candidate (rule evaluation)
    #   Single-stage GSP: 0.5 per candidate (scoring + sorting)

    cascade_compute = (
        len(advertisers) * 0.01 +   # Retrieval scans all
        len(retrieved) * 1.0 +       # DLRM scores retrieved
        len(ranked) * 0.05           # Re-ranker on ranked
    )
    single_compute = len(advertisers) * 1.0  # Expensive model on ALL

    compute_savings = 1 - (cascade_compute / single_compute) if single_compute > 0 else 0

    # Revenue comparison
    rev_diff = cascade_result.total_revenue - single_stage_result.total_revenue
    rev_diff_pct = (rev_diff / max(single_stage_result.total_revenue, 0.01)) * 100

    # ── Latency-to-Conversion Impact ──
    # Industry data: ~1% site conversion drop per 100ms additional latency
    # Cascade latency: retrieval(5ms) + ranking(25ms) + reranking(2ms) = ~32ms
    # Single-stage: scoring all candidates with DLRM = ~25ms × (n/batch_size)
    # but parallelized, so effective ~50-80ms for large candidate pools
    CONVERSION_LOSS_PER_100MS = 0.01  # 1% conversion drop per 100ms

    cascade_latency_ms = 5 + 25 + 2  # retrieval + DLRM on small set + rules
    single_latency_ms = min(80, 25 + len(advertisers) * 0.3)  # DLRM on all, parallelized

    cascade_conversion_loss = (cascade_latency_ms / 100) * CONVERSION_LOSS_PER_100MS
    single_conversion_loss = (single_latency_ms / 100) * CONVERSION_LOSS_PER_100MS

    # Net revenue = gross revenue × (1 - conversion_loss)
    cascade_net_revenue = cascade_result.total_revenue * (1 - cascade_conversion_loss)
    single_net_revenue = single_stage_result.total_revenue * (1 - single_conversion_loss)
    net_rev_diff = cascade_net_revenue - single_net_revenue

    return {
        "cascade": {
            "stage1_retrieval": {
                "input_candidates": len(advertisers),
                "output_candidates": len(retrieved),
                "compute_cost": round(len(advertisers) * 0.01, 1),
                "model": "Two-Tower (ANN)",
            },
            "stage2_ranking": {
                "input_candidates": len(retrieved),
                "output_candidates": len(ranked),
                "compute_cost": round(len(retrieved) * 1.0, 1),
                "model": "DLRM (Deep Model)",
            },
            "stage3_reranking": {
                "input_candidates": len(ranked),
                "output_candidates": len(final_set),
                "compute_cost": round(len(ranked) * 0.05, 1),
                "model": "Business Rules",
            },
            "auction_result": {
                "winners": len(cascade_result.winners),
                "total_revenue": cascade_result.total_revenue,
                "avg_cpc": cascade_result.avg_cpc,
                "fill_rate": cascade_result.fill_rate,
            },
            "total_compute": round(cascade_compute, 1),
        },
        "single_stage": {
            "all_candidates": len(advertisers),
            "winners": len(single_stage_result.winners),
            "total_revenue": single_stage_result.total_revenue,
            "avg_cpc": single_stage_result.avg_cpc,
            "fill_rate": single_stage_result.fill_rate,
            "total_compute": round(single_compute, 1),
        },
        "comparison": {
            "compute_savings_pct": round(compute_savings * 100, 1),
            "revenue_difference": round(rev_diff, 2),
            "revenue_difference_pct": round(rev_diff_pct, 1),
            "compute_cost_ratio": round(cascade_compute / max(single_compute, 1), 3),
            "revenue_per_compute_cascade": round(
                cascade_result.total_revenue / max(cascade_compute, 1), 2
            ),
            "revenue_per_compute_single": round(
                single_stage_result.total_revenue / max(single_compute, 1), 2
            ),
        },
        "latency_impact": {
            "cascade_latency_ms": cascade_latency_ms,
            "single_stage_latency_ms": round(single_latency_ms, 1),
            "latency_savings_ms": round(single_latency_ms - cascade_latency_ms, 1),
            "cascade_conversion_loss_pct": round(cascade_conversion_loss * 100, 2),
            "single_conversion_loss_pct": round(single_conversion_loss * 100, 2),
            "cascade_net_revenue": round(cascade_net_revenue, 2),
            "single_net_revenue": round(single_net_revenue, 2),
            "net_revenue_advantage": round(net_rev_diff, 2),
            "latency_changes_winner": net_rev_diff > 0 and rev_diff <= 0,
            "description": (
                f"Cascade adds {cascade_latency_ms}ms latency vs single-stage {single_latency_ms:.0f}ms. "
                f"At 1% conversion loss per 100ms, cascade loses {cascade_conversion_loss*100:.2f}% "
                f"of conversions vs {single_conversion_loss*100:.2f}% for single-stage. "
                f"After latency adjustment, cascade net revenue {'exceeds' if net_rev_diff > 0 else 'trails'} "
                f"single-stage by ${abs(net_rev_diff):.2f}."
            ),
        },
    }
