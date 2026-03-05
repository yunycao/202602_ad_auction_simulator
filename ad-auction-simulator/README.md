# Ad Auction Simulator: Balancing Multi-Objective Auction Dynamics with Adaptive Model Orchestration

A full-stack simulation of a large-scale ad auction system built on VCG (Vickrey-Clarke-Groves) as the production auction mechanism for feed-based platforms, with GSP as a legacy comparison baseline. Features budget pacing with adversarial robustness, quality feedback loops, Thompson Sampling exploration-exploitation, cascade ranking with latency-to-conversion analysis, multi-objective model strategy framework, and Claude-powered natural-language what-if analysis.

Built as a production-grade reference architecture for ad monetization systems, covering auction theory, adversarial dynamics, and system equilibrium. VCG is chosen as the default mechanism because truthful bidding simplifies the advertiser ecosystem, externality pricing ensures ads only appear when their value exceeds organic content opportunity cost, and welfare maximization aligns platform incentives with user experience.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  Dashboard · Pacing · Quality · Explore · Cascade · Ad Types VCG │
│  Ads Ranking · Ecosystem · Model Strategy · Finance · What-If    │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI Backend                         │
│                                                         │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ Auction       │  │ Recommender    │  │ Budget      │ │
│  │ Engine        │  │ Simulator      │  │ Pacing      │ │
│  │ VCG (prod)    │  │ 4 model types  │  │ Bid shading │ │
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
VCG-first auction engine with GSP as a comparison baseline. VCG uses externality-based pricing where each winner pays the harm their presence causes to other bidders — making truthful bidding a dominant strategy. Quality-weighted effective bids, reserve prices, and revenue vs welfare tradeoff analysis across 8 user segments demonstrate why VCG is the right production mechanism for feed-based platforms where ads compete against organic content.

### Ad Types VCG Mechanism
Implements the semi-separable position auction model from "Equilibria in Auctions with Ad Types" (Elzayn, Colini-Baldeschi, Lan, Schrijvers — WebConf 2022). Each ad has a publicly known type (video, link-click, impression, carousel, native) with its own geometric position discount curve δ^s_τ = base × decay^(s-1). Runs all 4 mechanism combinations — (Greedy/Optimal) × (GSP/VCG) — with VCG externality pricing, max-weight bipartite matching for optimal allocation, empirical Price of Anarchy analysis (vs theoretical bounds from Table 1), and no-regret learning (Exponential Weights) equilibrium simulation showing bidder convergence to coarse correlated equilibria.

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

### Financial Services Scenario Simulation
End-to-end scenario comparing 6 recommender algorithms (Two-Tower, GBDT, DLRM, Contextual Bandit, Hybrid Ensemble, Risk-Adjusted Ranker) for financial advertising across 5 sub-verticals (Credit Cards, Personal Loans, Insurance, Investment Platforms, Neobanks). 30-day simulation with trust evolution, risk incident tracking, and domain-specific multi-objective scoring (revenue 30%, quality/trust 35%, efficiency 15%, advertiser satisfaction 20%). Demonstrates that the revenue-maximizing algorithm is NOT optimal for finance — trust-weighted optimization selects a different winner.

### Ads Ranking Model
Production-style multi-task ranking pipeline simulating the full ranking stack used in large-scale ad platforms. Covers feature engineering (dense features, sparse embeddings, cross-feature interactions via advertiser × segment dot-products), multi-task prediction heads (pCTR, pCVR, pEngagement, pNegative with shared-bottom architecture), Platt scaling calibration (raw scores → calibrated probabilities with ECE tracking), and eCPM-based ranking with quality filtering and diversity injection. Includes a 5-variant ablation study (Full Model, No Calibration, Single-Task, No Cross-Features, Random Baseline) showing incremental revenue contribution of each component via a revenue waterfall, plus SHAP-style feature importance attribution and calibration reliability diagrams.

### Ecosystem Impact Analysis
Holistic view of how all mechanisms interact. Understanding these mechanism interactions and their equilibrium properties is what distinguishes systems-level thinking from component-level optimization.

### AI-Augmented What-If Analysis
Claude API with tool-use for natural-language queries about pacing dynamics, quality feedback, exploration tradeoffs, and cascade efficiency.

## See It In Action

**New to the project?** Explore without running code:

- **[DEMO.md](DEMO.md)** — Real data, auction tables, analysis examples
- **[VISUAL_DEMO.md](VISUAL_DEMO.md)** — Dashboard UI mockups with all tabs

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
| `/api/scenario/finance` | POST | Run 30-day finance algorithm comparison |
| `/api/scenario/finance/sub-verticals` | GET | Finance sub-vertical definitions |
| `/api/ad-types/compare` | POST | Run all 4 mechanism combinations with PoA |
| `/api/ad-types/equilibrium` | POST | No-regret learning equilibrium simulation |
| `/api/ad-types/discount-curves` | GET | Position discount curves for all ad types |
| `/api/ads-ranking/simulate` | POST | Full ranking pipeline with ablation study |
| `/api/ads-ranking/features` | POST | Feature importance analysis |
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
│   │   │   ├── model_framework.py   # Multi-objective model strategy framework
│   │   │   ├── ads_ranking_model.py  # Multi-task ranking pipeline with calibration
│   │   │   └── scenario_finance.py  # Financial services scenario simulation
│   │   ├── auction/
│   │   │   ├── engine.py            # Core GSP/VCG auction mechanisms
│   │   │   ├── models.py           # Pydantic models with ad type support
│   │   │   ├── ad_types_vcg.py     # Semi-separable auction with 4 mechanisms
│   │   │   ├── cascade.py          # 3-stage cascade ranking pipeline
│   │   │   └── metrics.py          # Revenue, welfare, efficiency metrics
│   │   ├── llm/
│   │   │   ├── agent.py             # Claude tool-use agent
│   │   │   └── prompts.py           # System prompt & tool definitions
│   │   └── api/
│   │       └── routes.py            # REST endpoints (28 endpoints)
│   ├── tests/
│   │   └── test_auction.py          # Unit tests
│   └── requirements.txt
├── frontend/
│   ├── AdAuctionSimulator.jsx       # React app (12 tabs, 2100+ lines)
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

### Ad Types VCG Mechanism
"Standard position auctions assume separability — all ads share the same position discount curve. But video ads lose 18% CTR per position while impression ads lose only 7%. This semi-separable model from Elzayn et al. (WebConf 2022) introduces type-specific discount curves where CTR = δ^s_τ × β_i. Greedy allocation is no longer optimal — it requires max-weight bipartite matching. We implement all 4 mechanism combinations and show that VCG with optimal allocation achieves PoA of 1.0 (theoretical optimum), while the no-regret learning simulation confirms bidders converge to equilibria that perform significantly better than worst-case bounds."

### Ads Ranking Model
"The ranking pipeline demonstrates how each component compounds to drive revenue. Starting from a random baseline, adding proper feature engineering (dense + sparse features) lifts revenue significantly. Cross-feature interactions — advertiser × segment embedding dot-products — capture non-linear affinity signals that additive models miss. Multi-task prediction (jointly modeling CTR, CVR, engagement, and negative feedback) provides implicit regularization and data efficiency for sparse conversion signals. Platt scaling calibration ensures predicted probabilities align with observed rates, preventing miscalibrated models from distorting eCPM ranking. The ablation study quantifies each component's incremental contribution, showing ~62% total lift from random to full model."

### Financial Services Scenario
"In financial services, the revenue-maximizing algorithm (DLRM) isn't the optimal choice. A 30-day simulation across 5 sub-verticals — credit cards, personal loans, insurance, investment platforms, neobanks — shows that the Risk-Adjusted Ranker wins by maintaining 87% user trust with only 3 risk incidents, while DLRM generates more raw revenue but at 78% trust and 7 risk incidents. With 35% quality weight reflecting the reality that a bad financial ad destroys months of trust-building, the multi-objective scoring function correctly identifies that trust preservation dominates short-term revenue in regulated verticals."

### The Synthesis
"These mechanisms — adversarial-robust pacing, quality feedback, exploration, latency-aware cascading, and multi-objective model orchestration — interact in non-obvious ways. Budget pacing amplifies quality feedback loops. Cascade latency budgets constrain model complexity. Adversarial behavior forces pricing randomization. The model strategy framework orchestrates all of this at a portfolio level, balancing revenue, user experience, advertiser health, and compute cost across segment-vertical-lifecycle contexts."

## Tech Stack

- **Backend:** Python 3.10+, FastAPI, Pydantic v2
- **Frontend:** React 18, Recharts, Vite
- **LLM:** Anthropic Claude API with tool-use
- **Testing:** pytest
- **Algorithms:** GSP/VCG auctions, Thompson Sampling, cascade ranking, quality feedback EMA
