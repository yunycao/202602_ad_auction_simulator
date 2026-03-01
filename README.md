# Ad Auction Simulator: Balancing Multi-Objective Auction Dynamics with Adaptive Model Orchestration

A full-stack simulation of a large-scale ad auction system featuring GSP/VCG mechanisms, budget pacing with adversarial robustness, quality feedback loops, Thompson Sampling exploration-exploitation, cascade ranking with latency-to-conversion analysis, multi-objective model strategy framework, and Claude-powered natural-language what-if analysis.

Built as a prototype architecture for ad monetization systems, covering auction theory, adversarial dynamics, and system equilibrium.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  Dashboard · Pacing · Quality Feedback · Explore/Exploit │
│  Cascade · Ecosystem · Model Strategy · What-If Chat     │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI Backend                         │
│                                                         │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ Auction       │  │ Recommender    │  │ Budget      │ │
│  │ Engine        │  │ Simulator      │  │ Pacing      │ │
│  │ GSP · VCG     │  │ 4 model types  │  │ Bid shading │ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ Quality       │  │ Thompson       │  │ Cascade     │ │
│  │ Feedback Loop │  │ Sampling       │  │ Ranking     │ │
│  │ CTR → QS      │  │ Bandit Router  │  │ 3-stage     │ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
│  ┌──────────────┐  ┌────────────────┐                   │
│  │ Synthetic     │  │ Claude LLM     │                   │
│  │ Data Gen      │  │ What-If Agent  │                   │
│  │ 80 advertisers│  │ Tool-use API   │                   │
│  └──────────────┘  └────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Key Capabilities

### Core Auction Mechanics
GSP and VCG auction implementations with quality-weighted effective bids, reserve prices, and externality-based pricing. Revenue vs welfare tradeoff analysis across 8 user segments.

### Budget Pacing with Adversarial Robustness
24-hour budget pacing simulation with bid shading and adversarial gaming analysis. Demonstrates how budget depletion creates temporal scarcity dynamics, but also how sophisticated "whale" advertisers can detect reserve price patterns and shift bids to exploit cheaper windows — eroding 5-15% of revenue. Includes mitigation strategies: randomized reserve perturbation, personalized floors, and minimum spend constraints.

### Quality Score Feedback Loop
Multi-round auction simulation showing quality score divergence. High-quality ads enter a virtuous cycle (win → data → better pCTR → higher quality), while low-quality ads enter a death spiral (lose → sparse data → stale pCTR → quality decay). Essential for understanding advertiser population equilibrium.

### Thompson Sampling Model Routing
Multi-armed bandit implementation for optimal model selection. Exploration rate emerges naturally from posterior uncertainty — no hyperparameter tuning needed. Achieves near-optimal regret bound, demonstrating how to balance learning vs earning in production model routing.

### Cascade Ranking with Latency-Conversion Analysis
Three-stage ranking pipeline (Two-Tower retrieval → DLRM ranking → business rule re-ranking) that achieves 60-80% compute savings. Goes beyond compute cost to model the latency-to-conversion impact: a 100ms delay in ad rendering causes ~1% drop in total site conversions, which can outweigh revenue gains from running more complex models. The true optimization target is net revenue after latency-adjusted conversion loss.

### Model Strategy Framework
Multi-objective model selection framework that jointly optimizes revenue, user experience, advertiser health, and compute cost across segment-vertical-lifecycle contexts. Features vertical-specific objective weights (6 verticals), lifecycle-aware exploration budgets (4 stages), and portfolio-level allocation with primary/secondary/exploration traffic splits. Answers: "Which model architecture should serve which context, and how should that change over time?"

### Ecosystem Impact Analysis
Holistic view of how all mechanisms interact. Understanding these mechanism interactions and their equilibrium properties is what distinguishes systems-level thinking from component-level optimization.

### AI-Augmented What-If Analysis
Claude API with tool-use for natural-language queries about pacing dynamics, quality feedback, exploration tradeoffs, and cascade efficiency.

## See It In Action

**New to the project?** Explore without running code:

- **[DEMO.md](https://github.com/yunycao/202602_ad_auction_simulator/blob/main/ad-auction-simulator/DEMO.md)** — Real data, auction tables, analysis examples
- **[VISUAL_DEMO.md](https://github.com/yunycao/202602_ad_auction_simulator/blob/main/ad-auction-simulator/VISUAL_DEMO.md)** — Dashboard UI mockups with all tabs
- **[Ad_Auction_Simulator.pptx](https://github.com/yunycao/202602_ad_auction_simulator/blob/main/Ad_Auction_Simulator_Dashboard.pptx)** — Simulator demo with model strategy

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # optional: add ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev  # starts on http://localhost:3000
```

### API Docs
With the backend running, visit http://localhost:8000/docs for interactive Swagger UI.

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auction/run` | POST | Run GSP or VCG auction on a segment |
| `/api/auction/compare` | POST | Side-by-side GSP vs VCG comparison |
| `/api/auction/with-pacing` | POST | 24-hour budget pacing simulation |
| `/api/auction/with-feedback` | POST | Multi-round quality feedback loop |
| `/api/auction/cascade-vs-single-stage` | POST | Cascade vs single-stage comparison |
| `/api/recommender/route` | POST | Get model routing for a segment |
| `/api/recommender/route-with-bandit` | POST | Thompson Sampling model routing |
| `/api/ecosystem/overview` | GET | Full ecosystem impact analysis |
| `/api/framework/allocate` | POST | Multi-objective model portfolio allocation |
| `/api/framework/analysis` | POST | Full framework analysis across all contexts |
| `/api/framework/verticals` | GET | Vertical definitions with strategy weights |
| `/api/framework/lifecycles` | GET | Lifecycle stage definitions |
| `/api/sweep/reserve` | POST | Reserve price sensitivity analysis |
| `/api/whatif` | POST | Natural-language what-if query (Claude) |

## Example What-If Queries

```
"Show me how budget depletion affects reserve prices through the day"
"What happens to quality scores after 10 auction rounds?"
"How much regret does Thompson Sampling incur vs greedy routing?"
"Compare cascade ranking efficiency vs single-stage"
"What if we raise reserve prices to $3.00?"
"Compare GSP vs VCG — how does advertiser surplus change?"
```

## Project Structure

```
ad-auction-simulator/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point
│   │   ├── auction/
│   │   │   ├── engine.py            # GSP & VCG with budget pacing
│   │   │   ├── models.py            # Pydantic data models
│   │   │   ├── metrics.py           # Revenue, welfare, quality feedback
│   │   │   └── cascade.py           # 3-stage cascade ranking
│   │   ├── simulation/
│   │   │   ├── advertisers.py       # Synthetic advertiser generation
│   │   │   ├── users.py             # User segments & hourly multipliers
│   │   │   └── bid_landscape.py     # Parameter sweep analysis
│   │   ├── recommender/
│   │   │   ├── simulator.py         # Model performance simulation
│   │   │   ├── router.py            # Segment-to-model routing
│   │   │   ├── bandit.py            # Thompson Sampling multi-armed bandit
│   │   │   └── model_framework.py   # Multi-objective model strategy framework
│   │   ├── llm/
│   │   │   ├── agent.py             # Claude tool-use agent
│   │   │   └── prompts.py           # System prompt & tool definitions
│   │   └── api/
│   │       └── routes.py            # REST endpoints (17 endpoints)
│   ├── tests/
│   │   └── test_auction.py          # Unit tests
│   └── requirements.txt
├── frontend/
│   ├── AdAuctionSimulator.jsx       # React app (8 tabs, 1000+ lines)
│   ├── src/main.jsx                 # Entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Key Technical Talking Points

### Budget Pacing & Adversarial Robustness
"Reserve prices vary 2-3x by time of day due to budget depletion, but advertisers aren't passive. Sophisticated whales detect the pattern and shift bids to exploit cheaper windows, eroding 5-15% of revenue. The system models this adversarial behavior and evaluates mitigation strategies: randomized reserve perturbation, per-advertiser personalized floors, and minimum 24h spread constraints. The equilibrium analysis shows that naive dynamic pricing is dominated by adversarial-aware pricing in realistic advertiser populations."

### Quality Feedback
"Quality scores are endogenous to auction outcomes. Low-quality ads lose impressions → pCTR becomes sparse → quality decays → lose more impressions. This death spiral creates natural selection in the advertiser population. Understanding this feedback loop is essential for equilibrium analysis and advertiser lifecycle management."

### Exploration-Exploitation
"Model routing is a bandit problem. Thompson Sampling naturally balances exploration and exploitation — the exploration rate emerges from posterior uncertainty, not a hyperparameter. My simulation shows ~8% optimal exploration rate, achieving near-optimal regret bounds."

### Cascade Ranking & Latency Economics
"The cascade saves 60-80% compute, but the real insight is that the cost isn't just compute — it's latency. A 100ms delay in ad rendering causes ~1% total site conversion drop, which can outweigh the revenue gain from running more complex models. The system models net revenue after latency-adjusted conversion loss, and shows that cascade's latency advantage (32ms vs 50-80ms single-stage) often flips the winner in the revenue comparison."

### Model Strategy Framework
"Model selection isn't a static routing decision — it's a multi-objective optimization problem across segment data density, vertical-specific objectives, and advertiser lifecycle stage. My framework jointly optimizes revenue, user experience, advertiser health, and compute cost using vertical-specific weights, then allocates traffic across a portfolio of primary/secondary/exploration models. New advertisers get 2-3x more exploration traffic. Finance verticals favor GBDT precision. Context-aware routing captures 15-40% more revenue vs one-size-fits-all selection."

### The Synthesis
"These mechanisms — adversarial-robust pacing, quality feedback, exploration, latency-aware cascading, and multi-objective model orchestration — interact in non-obvious ways. Budget pacing amplifies quality feedback loops. Cascade latency budgets constrain model complexity. Adversarial behavior forces pricing randomization. The model strategy framework orchestrates all of this at a portfolio level, balancing revenue, user experience, advertiser health, and compute cost across segment-vertical-lifecycle contexts."

## Tech Stack

- **Backend:** Python 3.10+, FastAPI, Pydantic v2
- **Frontend:** React 18, Recharts, Vite
- **LLM:** Anthropic Claude API with tool-use
- **Testing:** pytest
- **Algorithms:** GSP/VCG auctions, Thompson Sampling, cascade ranking, quality feedback EMA
