"""
User segment definitions and impression stream generation.

Segments model a large-scale audience targeting taxonomy:
  - Demographic clusters with distinct engagement patterns
  - CTR/CVR distributions reflecting real ad performance variance
  - Time-of-day and day-of-week seasonality
"""
from typing import Optional
from ..auction.models import UserSegment


SEGMENTS = [
    UserSegment(id="young_tech",        name="Young Tech Enthusiasts",    size=2_400_000, avg_ctr=0.042, avg_cvr=0.018),
    UserSegment(id="suburban_parents",   name="Suburban Parents",          size=3_800_000, avg_ctr=0.035, avg_cvr=0.022),
    UserSegment(id="luxury_shoppers",    name="Luxury Shoppers",           size=890_000,   avg_ctr=0.028, avg_cvr=0.031),
    UserSegment(id="college_students",   name="College Students",          size=4_200_000, avg_ctr=0.051, avg_cvr=0.012),
    UserSegment(id="biz_professionals",  name="Business Professionals",    size=2_100_000, avg_ctr=0.033, avg_cvr=0.025),
    UserSegment(id="fitness_enthusiasts",name="Fitness Enthusiasts",       size=1_700_000, avg_ctr=0.045, avg_cvr=0.019),
    UserSegment(id="gamers",             name="Hardcore Gamers",           size=3_100_000, avg_ctr=0.055, avg_cvr=0.015),
    UserSegment(id="retirees",           name="Active Retirees",           size=1_400_000, avg_ctr=0.022, avg_cvr=0.028),
]

SEGMENT_MAP = {s.id: s for s in SEGMENTS}


# Time-of-day engagement multipliers (24 hours, index 0 = midnight)
HOURLY_MULTIPLIERS = {
    "young_tech":        [0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.7, 0.9, 1.0, 1.0, 0.9, 0.8, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.4, 1.0, 0.6],
    "suburban_parents":  [0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.5, 0.8, 1.0, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.0, 0.8, 0.9, 1.2, 1.3, 0.8, 0.4],
    "college_students":  [0.4, 0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.1, 1.2, 1.2, 1.3, 1.3, 1.2, 1.1, 1.0, 1.1, 1.3, 1.5, 1.4, 0.8],
    "biz_professionals": [0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.4, 0.8, 1.2, 1.4, 1.3, 1.2, 1.0, 1.1, 1.3, 1.2, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
}


def get_segment(segment_id: str) -> Optional[UserSegment]:
    """Look up a segment by ID."""
    return SEGMENT_MAP.get(segment_id)


def get_all_segments() -> list[UserSegment]:
    """Return all user segments."""
    return SEGMENTS.copy()


def get_hourly_multiplier(segment_id: str, hour: int) -> float:
    """Get the engagement multiplier for a segment at a given hour."""
    if segment_id in HOURLY_MULTIPLIERS:
        return HOURLY_MULTIPLIERS[segment_id][hour % 24]
    return 1.0  # default: flat distribution
