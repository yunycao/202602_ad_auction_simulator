"""
System prompts and tool definitions for the Claude what-if agent.

The agent acts as a Staff-level monetization data scientist,
using structured tools to run simulations and return analysis.
"""

SYSTEM_PROMPT = """You are a Staff-level data scientist working on ads monetization.
You have access to a simulation of a large-scale ad auction system with GSP and VCG
mechanisms, synthetic advertisers across 8 verticals, 8 user segments, and
4 recommender model architectures.

Your role is to answer what-if questions about auction dynamics, revenue impact,
model routing decisions, and monetization strategy. You apply expert knowledge in:

PRINCIPLES:
- Always ground analysis in data from the simulation tools
- Frame tradeoffs explicitly (revenue vs user experience, precision vs latency)
- Connect findings to real-world ad system architecture
- Provide actionable recommendations, not just observations
- Quantify impact with specific numbers from the simulation

CONTEXT ON THE AD SYSTEM:
- Auction: Modified GSP with quality-weighted effective bids
- Quality score: pCTR × relevance × landing page quality
- Ranking: Cascaded system (retrieval → pre-ranking → main ranking → re-ranking)
- Pacing: Budget-constrained advertisers use probabilistic throttling
- Surfaces: Feed, Stories, Reels, Marketplace — each with different latency budgets

When asked a question, use the appropriate tools to run simulations, then
provide a structured analysis with specific numbers, tradeoff discussion,
and a clear recommendation."""

TOOL_DEFINITIONS = [
    {
        "name": "run_auction",
        "description": "Run an ad auction with specified parameters and return results including winners, revenue, and metrics.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mechanism": {
                    "type": "string",
                    "enum": ["GSP", "VCG"],
                    "description": "Auction mechanism to use",
                },
                "segment_id": {
                    "type": "string",
                    "description": "User segment ID to run the auction for. Options: young_tech, suburban_parents, luxury_shoppers, college_students, biz_professionals, fitness_enthusiasts, gamers, retirees",
                },
                "reserve_price": {
                    "type": "number",
                    "description": "Minimum bid price in dollars",
                    "default": 0.5,
                },
                "slots": {
                    "type": "integer",
                    "description": "Number of ad slots to fill",
                    "default": 5,
                },
                "quality_floor": {
                    "type": "number",
                    "description": "Minimum quality score (0-1) for advertiser eligibility",
                    "default": 0.0,
                },
            },
            "required": ["mechanism", "segment_id"],
        },
    },
    {
        "name": "compare_mechanisms",
        "description": "Run both GSP and VCG auctions on the same segment and compare results side by side.",
        "input_schema": {
            "type": "object",
            "properties": {
                "segment_id": {"type": "string"},
                "reserve_price": {"type": "number", "default": 0.5},
                "slots": {"type": "integer", "default": 5},
            },
            "required": ["segment_id"],
        },
    },
    {
        "name": "sweep_reserve_price",
        "description": "Sweep reserve prices from min to max and return revenue, fill rate, and CPC at each point.",
        "input_schema": {
            "type": "object",
            "properties": {
                "segment_id": {"type": "string"},
                "mechanism": {"type": "string", "enum": ["GSP", "VCG"], "default": "GSP"},
                "min_price": {"type": "number", "default": 0.1},
                "max_price": {"type": "number", "default": 10.0},
                "steps": {"type": "integer", "default": 20},
            },
            "required": ["segment_id"],
        },
    },
    {
        "name": "analyze_segment_models",
        "description": "Analyze which recommender model works best for a given segment, with performance metrics and routing rationale.",
        "input_schema": {
            "type": "object",
            "properties": {
                "segment_id": {"type": "string"},
                "surface": {
                    "type": "string",
                    "enum": ["feed", "stories", "reels", "marketplace"],
                    "default": "feed",
                },
            },
            "required": ["segment_id"],
        },
    },
    {
        "name": "competitive_analysis",
        "description": "Analyze the competitive landscape across all segments: advertiser density, bid levels, and budget concentration.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
]
