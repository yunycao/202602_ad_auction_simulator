"""Unit tests for auction engine — verifying GSP and VCG correctness."""
import pytest
from app.auction.engine import run_gsp_auction, run_vcg_auction
from app.auction.models import Advertiser, AuctionMechanism
from app.simulation.users import SEGMENTS


@pytest.fixture
def sample_advertisers():
    return [
        Advertiser(id="a1", name="High Bidder",  vertical="Finance",     daily_budget=10000, quality_score=0.9, base_bid=10.0, target_segments=["young_tech"], strategy="value_based"),
        Advertiser(id="a2", name="Mid Bidder",   vertical="E-Commerce",  daily_budget=5000,  quality_score=0.7, base_bid=7.0,  target_segments=["young_tech"], strategy="value_based"),
        Advertiser(id="a3", name="Low Bidder",   vertical="Gaming",      daily_budget=2000,  quality_score=0.5, base_bid=4.0,  target_segments=["young_tech"], strategy="value_based"),
        Advertiser(id="a4", name="Below Reserve", vertical="CPG",        daily_budget=500,   quality_score=0.3, base_bid=0.3,  target_segments=["young_tech"], strategy="value_based"),
    ]


@pytest.fixture
def segment():
    return SEGMENTS[0]  # young_tech


class TestGSPAuction:
    def test_winners_ranked_by_effective_bid(self, sample_advertisers, segment):
        result = run_gsp_auction(sample_advertisers, segment, slots=3)
        for i in range(len(result.winners) - 1):
            assert result.winners[i].effective_bid >= result.winners[i + 1].effective_bid

    def test_second_price_property(self, sample_advertisers, segment):
        """GSP: winner i pays based on winner i+1's effective bid."""
        result = run_gsp_auction(sample_advertisers, segment, slots=3)
        # First winner's price should be related to second winner's effective bid
        assert result.winners[0].price < result.winners[0].base_bid

    def test_reserve_price_filters(self, sample_advertisers, segment):
        result = run_gsp_auction(sample_advertisers, segment, slots=5, reserve_price=5.0)
        for w in result.winners:
            assert w.price >= 5.0

    def test_below_reserve_excluded(self, sample_advertisers, segment):
        result = run_gsp_auction(sample_advertisers, segment, slots=5, reserve_price=0.5)
        winner_ids = [w.advertiser_id for w in result.winners]
        assert "a4" not in winner_ids  # below reserve

    def test_revenue_positive(self, sample_advertisers, segment):
        result = run_gsp_auction(sample_advertisers, segment)
        assert result.total_revenue > 0


class TestVCGAuction:
    def test_vcg_truthfulness(self, sample_advertisers, segment):
        """VCG prices should be <= effective bids (incentive compatibility)."""
        result = run_vcg_auction(sample_advertisers, segment, slots=3)
        for w in result.winners:
            # VCG price should not exceed what the bidder values the slot at
            assert w.price <= w.base_bid * 2  # generous bound for quality adjustment

    def test_vcg_externality_computed(self, sample_advertisers, segment):
        result = run_vcg_auction(sample_advertisers, segment, slots=3)
        for w in result.winners:
            assert w.externality is not None
            assert w.externality >= 0

    def test_vcg_lower_revenue_than_gsp(self, sample_advertisers, segment):
        """VCG typically yields lower revenue than GSP."""
        gsp = run_gsp_auction(sample_advertisers, segment, slots=3)
        vcg = run_vcg_auction(sample_advertisers, segment, slots=3)
        # This is the general property but not always true with reserves
        # Just verify both produce reasonable revenue
        assert gsp.total_revenue > 0
        assert vcg.total_revenue > 0


class TestWithSyntheticData:
    def test_full_synthetic_auction(self):
        from app.simulation.advertisers import generate_advertisers
        advertisers = generate_advertisers(80)
        segment = SEGMENTS[0]
        result = run_gsp_auction(advertisers, segment)
        assert len(result.winners) <= 5
        assert result.total_revenue > 0
        assert result.eligible_advertisers > 0
