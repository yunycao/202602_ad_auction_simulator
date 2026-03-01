"""
Claude-powered what-if analysis agent.

Uses Anthropic's tool-use API to let Claude run auction simulations,
analyze results, and provide deep monetization insights.

Architecture:
  1. User asks natural-language question
  2. Claude receives the question + tool definitions
  3. Claude calls simulation tools to gather data
  4. Claude synthesizes findings into structured analysis

Requires ANTHROPIC_API_KEY environment variable.
"""
import os
import json
from typing import Any, Optional

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

from .prompts import SYSTEM_PROMPT, TOOL_DEFINITIONS
from ..auction.engine import run_auction, run_gsp_auction, run_vcg_auction
from ..auction.models import AuctionMechanism
from ..auction.metrics import full_metrics
from ..simulation.users import get_segment, get_all_segments
from ..simulation.advertisers import generate_advertisers
from ..simulation.bid_landscape import reserve_price_sweep, competitive_landscape
from ..recommender.router import route_segment
from ..recommender.simulator import simulate_all_models


class AuctionAgent:
    """LLM agent with tool-use for ad auction what-if analysis."""

    def __init__(self, api_key: Optional[str] = None, seed: int = 42):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY required. Set it as an environment variable "
                "or pass api_key to the constructor."
            )
        if not HAS_ANTHROPIC:
            raise ImportError("pip install anthropic")

        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.advertisers = generate_advertisers(80, seed)
        self.segments = get_all_segments()
        self.model = "claude-sonnet-4-20250514"
        self.max_turns = 5  # prevent infinite tool loops

    def _execute_tool(self, tool_name: str, tool_input: dict) -> Any:
        """Execute a simulation tool and return results."""

        if tool_name == "run_auction":
            segment = get_segment(tool_input["segment_id"])
            if not segment:
                return {"error": f"Unknown segment: {tool_input['segment_id']}"}
            mechanism = AuctionMechanism(tool_input.get("mechanism", "GSP"))
            quality_floor = tool_input.get("quality_floor", 0.0)
            filtered_ads = [a for a in self.advertisers if a.quality_score >= quality_floor]
            result = run_auction(
                filtered_ads, segment, mechanism,
                tool_input.get("slots", 5),
                tool_input.get("reserve_price", 0.5),
            )
            return full_metrics(result)

        elif tool_name == "compare_mechanisms":
            segment = get_segment(tool_input["segment_id"])
            if not segment:
                return {"error": f"Unknown segment: {tool_input['segment_id']}"}
            rp = tool_input.get("reserve_price", 0.5)
            slots = tool_input.get("slots", 5)
            gsp = run_gsp_auction(self.advertisers, segment, slots, rp)
            vcg = run_vcg_auction(self.advertisers, segment, slots, rp)
            return {
                "GSP": full_metrics(gsp),
                "VCG": full_metrics(vcg),
                "revenue_delta_pct": round(
                    (vcg.total_revenue - gsp.total_revenue) / max(gsp.total_revenue, 0.01) * 100, 2
                ),
            }

        elif tool_name == "sweep_reserve_price":
            segment = get_segment(tool_input["segment_id"])
            if not segment:
                return {"error": f"Unknown segment: {tool_input['segment_id']}"}
            mechanism = AuctionMechanism(tool_input.get("mechanism", "GSP"))
            return reserve_price_sweep(
                self.advertisers, segment, mechanism,
                tool_input.get("min_price", 0.1),
                tool_input.get("max_price", 10.0),
                tool_input.get("steps", 20),
            )

        elif tool_name == "analyze_segment_models":
            segment = get_segment(tool_input["segment_id"])
            if not segment:
                return {"error": f"Unknown segment: {tool_input['segment_id']}"}
            surface = tool_input.get("surface", "feed")
            decision = route_segment(segment, surface)
            model_perf = simulate_all_models(segment)
            return {
                "routing_decision": {
                    "recommended": decision.model_name,
                    "reason": decision.reason,
                    "revenue_lift": decision.revenue_lift,
                    "latency_ms": decision.latency_ms,
                },
                "all_models": [
                    {
                        "model": r.model_name,
                        "ctr_lift": r.ctr_lift,
                        "revenue_lift": r.revenue_lift,
                        "latency_ms": r.latency_cost_ms,
                    }
                    for r in model_perf
                ],
                "alternatives": decision.alternatives,
            }

        elif tool_name == "competitive_analysis":
            return competitive_landscape(self.advertisers, self.segments)

        return {"error": f"Unknown tool: {tool_name}"}

    async def ask(self, question: str) -> str:
        """
        Send a what-if question to Claude and get an analysis back.

        Handles multi-turn tool use: Claude can call tools, get results,
        and call more tools before producing the final answer.
        """
        messages = [{"role": "user", "content": question}]

        for turn in range(self.max_turns):
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )

            # Check if Claude wants to use tools
            if response.stop_reason == "tool_use":
                # Process all tool calls
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = self._execute_tool(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str),
                        })

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

            else:
                # Claude produced a final text response
                text_blocks = [b.text for b in response.content if hasattr(b, "text")]
                return "\n".join(text_blocks)

        return "Analysis exceeded maximum tool-use turns. Please try a simpler question."

    def ask_sync(self, question: str) -> str:
        """Synchronous wrapper for the ask method."""
        import asyncio
        return asyncio.run(self.ask(question))
