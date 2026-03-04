"""Pydantic models for the ad auction system."""
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional


class BidStrategy(str, Enum):
    VALUE_BASED = "value_based"
    ROI_TARGET = "roi_target"
    BUDGET_PACING = "budget_pacing"


class AuctionMechanism(str, Enum):
    GSP = "GSP"
    VCG = "VCG"


class AllocationAlgorithm(str, Enum):
    GREEDY = "greedy"
    OPTIMAL = "optimal"


class Advertiser(BaseModel):
    id: str
    name: str
    vertical: str
    daily_budget: float = Field(ge=0)
    quality_score: float = Field(ge=0, le=1)
    base_bid: float = Field(ge=0)
    target_segments: list[str] = []
    strategy: BidStrategy = BidStrategy.VALUE_BASED
    ad_type: str = "link_click"  # video, link_click, impression, carousel, native


class UserSegment(BaseModel):
    id: str
    name: str
    size: int
    avg_ctr: float = Field(ge=0, le=1)
    avg_cvr: float = Field(ge=0, le=1)


class AdSlot(BaseModel):
    position: int
    ctr_multiplier: float = 1.0  # position-based CTR decay


class BidEntry(BaseModel):
    advertiser: Advertiser
    effective_bid: float
    predicted_ctr: float
    quality_adjusted_bid: float


class AuctionWinner(BaseModel):
    slot: int
    advertiser_id: str
    advertiser_name: str
    vertical: str
    base_bid: float
    quality_score: float
    effective_bid: float
    price: float  # actual CPC charged
    predicted_ctr: float
    externality: Optional[float] = None  # VCG only


class AuctionResult(BaseModel):
    mechanism: AuctionMechanism
    segment_id: str
    winners: list[AuctionWinner]
    total_revenue: float
    avg_cpc: float
    eligible_advertisers: int
    social_welfare: Optional[float] = None
    fill_rate: float = 0.0


class WhatIfParams(BaseModel):
    reserve_price: float = 0.5
    slots: int = 5
    mechanism: AuctionMechanism = AuctionMechanism.GSP
    segment_id: Optional[str] = None
    quality_floor: float = 0.0
    bid_multiplier: float = 1.0


class WhatIfResult(BaseModel):
    params: WhatIfParams
    segment_results: list[AuctionResult]
    total_revenue: float
    total_impressions: int
    total_clicks: int
    avg_rpm: float
