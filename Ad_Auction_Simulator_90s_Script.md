# Ad Auction Simulator — 90-Second Verbal Script

**Target: ~225 words | ~90 seconds at natural pace**

---

I built an end-to-end Ad Auction Simulator that models the full ads monetization stack — from auction mechanics through ranking, pacing, and model orchestration. Let me walk you through the key systems I designed.

First, the **auction engine** — I implemented both GSP and VCG mechanisms with quality-weighted bids and demonstrated quantitatively why GSP yields 6-7% higher revenue across segments due to non-truthful bidding dynamics, and why the revenue-optimal reserve price diverges from the welfare-optimal one.

Second, I built a **multi-task ads ranking pipeline** — feature engineering with dense features, sparse embeddings, and cross-feature interactions through advertiser-segment dot-products. The model predicts four objectives jointly: pCTR, pCVR, engagement, and negative feedback. I added Platt scaling calibration and ran a five-variant ablation study showing each component's incremental revenue contribution — calibration alone lifts 5%, multi-task adds 6%, cross-features another 4%.

Third, **adversarial robustness** — I simulated whale advertisers detecting 2.3x reserve price variation across hours and showed how they exploit cheap windows, eroding 5-15% of revenue. I designed randomized perturbation and personalized floor mitigations.

Fourth, the **systems interactions** — I modeled how pacing, quality feedback loops, Thompson Sampling exploration, and cascade ranking interact in non-obvious ways. For example, budget depletion amplifies quality score divergence, and cascade depth constrains where exploration is cost-effective.

Finally, I built a **financial services vertical scenario** showing why the revenue-maximizing model isn't optimal when trust and regulatory risk are weighted — demonstrating multi-objective thinking beyond pure CTR optimization.

---

### Key Talking Points to Emphasize

- **Systems-level ownership**: Not just one model — the full monetization stack and how components interact at equilibrium
- **Quantitative rigor**: Every claim backed by simulation — ablation studies, revenue waterfalls, calibration curves
- **Adversarial thinking**: Didn't assume cooperative agents — modeled strategic behavior and designed mitigations
- **Multi-objective tradeoffs**: Revenue vs user experience vs advertiser health vs compute — with domain-specific weighting across verticals
- **Production awareness**: Latency-to-conversion economics (~1% loss per 100ms), cascade compute savings (67%), cold-start handling across lifecycle stages
