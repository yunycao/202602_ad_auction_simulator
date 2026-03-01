# Visual Demo: Ad Auction Simulator UI

This document shows what the dashboard looks like with colors, layout, and real-time visualizations.

---

## 1. Main Dashboard Tab

### Metrics Cards (Top Section)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AD AUCTION SIMULATOR                                      │
│    GSP/VCG Auction Engine · Recommender Model Routing · LLM-Powered Analysis │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐
│ Total Revenue    │  │ Avg RPM          │  │ Total Clicks     │  │ Advs.    │
│                  │  │                  │  │                  │  │          │
│  $2,847.32       │  │    $4.87         │  │   14,287         │  │   80     │
│                  │  │                  │  │                  │  │          │
│ Per 1K impr.     │  │ Rev per 1K impr  │  │ Across segments  │  │ 8 vert.  │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────┘

Color scheme:
- Card background: #FFFFFF (white)
- Metric values: #111827 (dark gray, large & bold)
- Labels: #6B7280 (light gray, uppercase)
```

---

## 2. Revenue by Segment: GSP vs VCG

### Bar Chart Visualization

```
Revenue by Segment (GSP vs VCG)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$400 ┤
     │
$350 ┤        ┌──┐              ┌──┐              ┌──┐
     │        │  │              │  │              │  │
$300 ┤        │  │    ┌──┐      │  │    ┌──┐      │  │    ┌──┐
     │  ┌──┐  │  │    │  │  ┌──┐│  │    │  │  ┌──┐│  │    │  │  ┌──┐
$250 ┤  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
     │  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
$200 ┤  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
     │  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
$150 ┤  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
     │  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
$100 ┤  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
     │  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
 $50 ┤  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
     │  │  │  │  │    │  │  │  ││  │    │  │  │  ││  │    │  │  │  │
  $0 └──┴──┴──┴──┴────┴──┴──┴──┴┴──┴────┴──┴──┴──┴┴──┴────┴──┴──┴──┴──
     Y.T. S.P. L.S. C.S. B.P. F.E. G. A.R.

Legend:
    GSP (Blue #2563EB)    VCG (Purple #7C3AED)

Key insights shown:
- Young Tech: $387 GSP, $294 VCG (GSP wins with higher bids)
- Luxury Shoppers: $156 GSP, $98 VCG (sparse segment, both lower)
- College Students: $412 GSP, $321 VCG (largest segment)
```

**What the user sees:**
- Clean bar charts with two colors (blue for GSP, purple for VCG)
- Interactive tooltips showing exact values on hover
- Responsive design adapts to screen size
- Color contrast optimized for accessibility

---

## 3. Revenue vs Reserve Price Curve

### Area Chart with Gradient

```
Revenue vs Reserve Price
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$3,500 │
       │     ╱─────────────╲
$3,250 │    ╱               ╲
       │   ╱                 ╲
$3,000 │  ╱                   ╲___
       │ ╱                        ╲
$2,750 │╱                          ╲___
       │                               ╲___
$2,500 │                                   ╲
       │                                    ╲___
$2,250 │                                        ╲____
       │                                             ╲____
$2,000 └────────────────────────────────────────────────────
       $0.1  $0.5  $1.0  $1.5  $2.0  $2.5  $3.0  $3.5  $4.0

Color gradient:
- Top area: Blue gradient (#2563EB) fading to transparent
- Line: Solid blue (#2563EB)
- Background: Light gray grid (#F3F4F6)

Data points marked:
• $0.50 (current): $2,847 revenue ← YOU ARE HERE
• $2.00 (optimal): $3,421 revenue ← PEAK ZONE
• $4.00 (max): $1,923 revenue ← FALLING OFF
```

**Interactive features:**
- Hover over curve to see exact revenue at that reserve price
- Highlighted sweet spot at $2.00
- Tooltip shows "12% more revenue at this reserve"

---

## 4. Segment Explorer Tab - Model Comparison

### Radar Chart for Model Performance

```
Selected Segment: College Students (4.2M users, 5.1% CTR)

Radar Chart: Model Performance
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                    CTR Lift
                       │
                      100
                      ╱ │ ╲
                    ╱   │   ╲
                  ╱     │     ╲
                ╱       │       ╲
              ╱         │         ╲
          100 ┼─────────┼─────────┼ 100
            ╱ │╲       │       ╱│  ╲
          ╱   │ ╲      │     ╱  │    ╲
        ╱     │  ╲     │   ╱    │      ╲
      ╱       │   ╲    │ ╱      │        ╲  Revenue
    Speed   100    ╲   │╱       │         ╲   Lift
     ┼─────────────  ◆ ┬ ◇ ─────────────┼
     │              │ │ │             │
     │            ┌─┘ │ └─┐           │
     │          ╱     │     ╲         │
     │        ╱       │       ╲       │
     │      ╱         │         ╲     │
     │    ╱           │           ╲   │
     │  ╱             │             ╲ │
     └────────────────┼─────────────────
                   Precision

Legend:
═════════════════════════════════════════
◆ Two-Tower    (Coverage: High)
● GBDT         (Precision: Highest)
◇ DLRM         (Revenue: Highest) ← RECOMMENDED
△ Bandit       (Exploration: Best)
═════════════════════════════════════════

Area fills under each model in different colors:
- Two-Tower: Light Blue (#DBEAFE)
- GBDT: Light Green (#DCFCE7)
- DLRM: Light Purple (#F3E8FF) ← Selected/highlighted
- Bandit: Light Orange (#FED7AA)
```

**Interactive:**
- Click legend items to show/hide models
- Hover over points to see exact values
- Recommended model highlighted in bold color

---

## 5. Auction Winner Table

### Detailed Results Table

```
Auction Winners — Sample Segment: Young Tech Enthusiasts

┌────┬──────────────────────────┬────────────┬──────┬────────┬──────────┬────────┬────────┐
│ 🥇 │ Advertiser               │ Vertical   │ Bid  │Quality │Eff. Bid  │  CPC   │  pCTR  │
├────┼──────────────────────────┼────────────┼──────┼────────┼──────────┼────────┼────────┤
│ 1  │ Finance Advertiser 23    │ Finance    │$9.54 │ 0.891  │ 8.504    │ $6.21  │ 4.21%  │
│    │ 💰 High-value advertiser │            │      │        │          │        │        │
├────┼──────────────────────────┼────────────┼──────┼────────┼──────────┼────────┼────────┤
│ 2  │ E-Commerce Advertiser 5  │ E-Commerce │$7.82 │ 0.764  │ 5.974    │ $3.89  │ 3.87%  │
│    │                          │            │      │        │          │        │        │
├────┼──────────────────────────┼────────────┼──────┼────────┼──────────┼────────┼────────┤
│ 3  │ SaaS Advertiser 12       │ SaaS       │$6.45 │ 0.701  │ 4.522    │ $2.45  │ 3.45%  │
│    │ 🚀 High quality          │            │      │        │          │        │        │
├────┼──────────────────────────┼────────────┼──────┼────────┼──────────┼────────┼────────┤
│ 4  │ Gaming Advertiser 8      │ Gaming     │$5.12 │ 0.623  │ 3.190    │ $1.87  │ 3.12%  │
│    │                          │            │      │        │          │        │        │
├────┼──────────────────────────┼────────────┼──────┼────────┼──────────┼────────┼────────┤
│ 5  │ Travel Advertiser 15     │ Travel     │$4.33 │ 0.542  │ 2.347    │ $1.23  │ 2.89%  │
│    │                          │            │      │        │          │        │        │
└────┴──────────────────────────┴────────────┴──────┴────────┴──────────┴────────┴────────┘

Row colors:
- Row 1: Light blue (#EFF6FF) — winning slot
- Row 2-5: Alternating white/gray for readability

Badge indicators:
💰 = High CPC (premium advertiser)
🚀 = High quality score (reliable)
⚠️  = Low fill rate warning
✨ = New advertiser (cold-start)

Sortable columns: Click any header to sort
Filterable: Filter by vertical, quality range, bid range
```

---

## 6. Segment Routing Table

### All Segments with Model Recommendations

```
Segment → Model Routing Table
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────┬────────────────────┬──────────┬───────────┬────────────────────┐
│ Segment            │ Recommended Model  │ Rev Lift │ Latency   │ Routing Reason     │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Young Tech          │ DLRM Deep Model    │  0.860   │  24.5ms   │Warm, high density  │
│(2.4M, density:60%) │ ▓▓▓▓▓▓▓▓░░         │          │ [████░]   │→ use expensive mdl │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Suburban Parents    │ GBDT Ranker        │  0.745   │  12.1ms   │Tabular features    │
│(3.8M, density:95%) │ ▓▓▓▓▓▓▓▓░░         │          │ [██░░░░░] │→ lower cost OK     │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Luxury Shoppers     │ Two-Tower Retrieval│  0.623   │  5.2ms    │Sparse but high-val │
│(0.89M,density:22%) │ ▓▓▓▓▓▓░░░░         │          │ [█░░░░░░] │→ fast + explorative│
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│College Students    │ DLRM Deep Model    │  0.860   │  24.8ms   │Largest segment     │
│(4.2M, density:105%)│ ▓▓▓▓▓▓▓▓░░         │          │ [████░░░] │→ data-rich, invest │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Business Prof.      │ GBDT Ranker        │  0.712   │  11.9ms   │ROI-focused buyers  │
│(2.1M, density:53%) │ ▓▓▓▓▓▓░░░░         │          │ [██░░░░░] │→ predictable bdg   │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Fitness Enthusiasts │ Two-Tower Retrieval│  0.701   │  5.4ms    │Niche + exploration │
│(1.7M, density:43%) │ ▓▓▓▓▓▓░░░░         │          │ [█░░░░░░] │→ bandit 5% traffic │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Hardcore Gamers     │ DLRM Deep Model    │  0.847   │  25.1ms   │High engagement     │
│(3.1M, density:78%) │ ▓▓▓▓▓▓▓░░░         │          │ [████░░░] │→ precision matters │
├────────────────────┼────────────────────┼──────────┼───────────┼────────────────────┤
│Active Retirees     │ Contextual Bandit  │  0.612   │  7.8ms    │Cold-start friendly │
│(1.4M, density:35%) │ ▓▓▓░░░░░░░         │          │ [█░░░░░░] │→ explore new ads   │
└────────────────────┴────────────────────┴──────────┴───────────┴────────────────────┘

Color coding:
🟦 DLRM (most expensive, highest precision) - Blue row highlights
🟩 GBDT (mid-cost, strong precision) - Green row highlights
🟪 Two-Tower (fast, good coverage) - Purple row highlights
🟧 Bandit (exploration-focused) - Orange row highlights

Bar charts:
▓ = Performance (filled), ░ = Remaining capacity
[████░] = Latency utilization (filled = closer to budget)
```

---

## 7. What-If Chat Tab

### Interactive Chat Interface

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      WHAT-IF ANALYSIS CHAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Scroll up to see chat history]

┌─────────────────────────────────────────────────────────────────────────────┐
│ Welcome to the **Ad Auction What-If Analyzer**. I can run simulations on   │
│ the GSP/VCG auction system and analyze the impact on revenue, advertiser   │
│ surplus, and segment performance.                                          │
│                                                                             │
│ Try asking:                                                                 │
│ • "What if we raise reserve prices to $2.00?"                             │
│ • "Compare GSP vs VCG mechanisms"                                         │
│ • "Which model works best for College Students?"                          │
│ • "What if we set a quality floor of 0.5?"                                │
│                                                                             │
│ [Assistant message box - light gray background (#F9FAFB)]                 │
└─────────────────────────────────────────────────────────────────────────────┘

Quick suggestion buttons:
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ What if reserve price is $2? │  │ Compare GSP vs VCG           │
└──────────────────────────────┘  └──────────────────────────────┘
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Which model for Gamers?      │  │ Quality floor 0.6?           │
└──────────────────────────────┘  └──────────────────────────────┘

User types: "What if we raise reserve prices to $2.50?"

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                              What if we raise reserve prices to $2.50?      │
│                                                          [User msg - blue]  │
└─────────────────────────────────────────────────────────────────────────────┘

[Analyzing auction dynamics...]

┌─────────────────────────────────────────────────────────────────────────────┐
│ ## Reserve Price Impact Analysis                                           │
│                                                                             │
│ Changing reserve price from $0.50 to $2.50:                                │
│                                                                             │
│ **Revenue:** $2,847 → $3,156 (+10.8%)                                     │
│                                                                             │
│ **Key Finding:** Higher reserve prices filter low-quality bids, increasing │
│ average CPC. However, watch for fill rate degradation in smaller segments  │
│ like Active Retirees.                                                       │
│                                                                             │
│ **Recommendation for production discussion:** In production ad systems,   │
│ reserve prices are set per-auction using ML models that predict the      │
│ "floor" below which showing an ad degrades user experience. The          │
│ revenue-optimal reserve is NOT the welfare-optimal reserve — this tension│
│ between monetization and user experience is core to monetization strategy.│
│                                                                             │
│ [Assistant message box - light gray background with markdown formatting]   │
└─────────────────────────────────────────────────────────────────────────────┘

Input field at bottom:
┌────────────────────────────────────────────┬──────────┐
│ Ask a what-if question about the auction...│  Send ▶  │
└────────────────────────────────────────────┴──────────┘
```

**UI Features:**
- Clean markdown rendering in chat responses
- Code blocks and tables render nicely
- Bold/italic text for emphasis
- Bullet points for key insights
- Input field at bottom (always visible)
- Auto-scroll to latest message

---

## 8. Overall Color Palette

### Used Throughout the Dashboard

```
PRIMARY COLORS:
  Blue      #2563EB  ████  Charts, metrics, primary actions
  Purple    #7C3AED  ████  Secondary comparisons, DLRM model
  Green     #16A34A  ████  Success states, GBDT model
  Orange    #EA580C  ████  Warnings, Bandit model
  Cyan      #0891B2  ████  Info states, Two-Tower model
  Red       #E11D48  ████  Critical alerts
  Yellow    #CA8A04  ████  Accent, highlights

BACKGROUND COLORS:
  White     #FFFFFF  ████  Card backgrounds
  Off-white #F8FAFC  ████  Page background
  Gray-50   #F9FAFB  ████  Secondary backgrounds
  Gray-100  #F3F4F6  ████  Border/divider color

TEXT COLORS:
  Dark      #111827  ████  Headlines, primary text
  Medium    #374151  ████  Secondary text
  Light     #6B7280  ████  Labels, tertiary text
  Muted     #9CA3AF  ████  Disabled states

SEMANTIC COLORS:
  Success   #10B981  ████  Green indicators
  Warning   #F59E0B  ████  Orange alerts
  Error     #EF4444  ████  Red failures
  Info      #3B82F6  ████  Blue notifications
```

**Design philosophy:**
- Clean, modern look with minimal rounded corners
- High contrast text for readability
- Subtle shadows for depth
- Consistent spacing throughout
- Responsive design (mobile, tablet, desktop)
- Dark mode friendly (inverted colors available)

---

## 9. Interactive Features

### What Users Can Do

**Dashboard Tab:**
- ✅ Hover over chart bars → see exact values in tooltip
- ✅ Click legend items → show/hide data series
- ✅ Resize charts → responsive to window size
- ✅ Export charts → download as PNG/SVG

**Segment Explorer:**
- ✅ Click segment buttons → view that segment's data
- ✅ Compare models → side-by-side radar chart
- ✅ Sort table → click header to sort by any column
- ✅ Filter table → by vertical, model, latency, etc.

**What-If Chat:**
- ✅ Type natural language questions
- ✅ Click suggested queries for examples
- ✅ Copy response text
- ✅ Download results as CSV/JSON

---

## 10. Mobile Responsiveness

### How It Looks on Different Devices

**Desktop (1920x1080):**
```
┌──────────────────────────────────────────────────────────────────┐
│ TITLE + TABS                                                     │
├──────────────────────────────────────────────────────────────────┤
│ [Card 1]    [Card 2]    [Card 3]    [Card 4]                    │
├──────────────────────────────────────────────────────────────────┤
│ [Chart 1 (50%)]          │ [Chart 2 (50%)]                      │
├──────────────────────────────────────────────────────────────────┤
│ [Full-width Table]                                               │
└──────────────────────────────────────────────────────────────────┘
```

**Tablet (768x1024):**
```
┌────────────────────────────┐
│ TITLE + TABS               │
├────────────────────────────┤
│ [Card 1]  [Card 2]        │
│ [Card 3]  [Card 4]        │
├────────────────────────────┤
│ [Full-width Chart]        │
├────────────────────────────┤
│ [Full-width Chart]        │
├────────────────────────────┤
│ [Table - scrollable]      │
└────────────────────────────┘
```

**Mobile (375x667):**
```
┌────────────┐
│ TITLE+TABS │
├────────────┤
│ [Card 1]   │
├────────────┤
│ [Card 2]   │
├────────────┤
│ [Chart 1]  │
│(scrollable)│
├────────────┤
│ [Chart 2]  │
├────────────┤
│ [Table]    │
│ (horiz     │
│  scroll)   │
└────────────┘
```

---

## Summary

The Ad Auction Simulator dashboard provides:

✅ **Visual clarity** — Color-coded metrics, charts with legends, easy-to-read tables
✅ **Interactivity** — Hover tooltips, clickable elements, sortable/filterable data
✅ **Responsiveness** — Works on desktop, tablet, and mobile
✅ **Modern design** — Clean layout, professional colors, high contrast
✅ **Real-time updates** — Charts update as parameters change
✅ **Accessibility** — Clear labels, good color contrast, keyboard navigation

All visualizations use:
- **Recharts** for charts (bar, area, radar, scatter)
- **Tailwind CSS** for styling (responsive, utility-first)
- **Responsive grid layout** for adaptive design
- **SVG graphics** for crisp rendering at any size
