import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ScatterChart, Scatter, Cell, Area, AreaChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

// ─── Synthetic Data Engine ──────────────────────────────────────────
const VERTICALS = ["E-Commerce", "Gaming", "Finance", "Travel", "Health", "Entertainment", "SaaS", "CPG"];
const SEGMENTS = [
  { id: "young_tech", name: "Young Tech Enthusiasts", size: 2400000, avgCTR: 0.042, avgCVR: 0.018, color: "#2563eb" },
  { id: "suburban_parents", name: "Suburban Parents", size: 3800000, avgCTR: 0.035, avgCVR: 0.022, color: "#16a34a" },
  { id: "luxury_shoppers", name: "Luxury Shoppers", size: 890000, avgCTR: 0.028, avgCVR: 0.031, color: "#9333ea" },
  { id: "college_students", name: "College Students", size: 4200000, avgCTR: 0.051, avgCVR: 0.012, color: "#ea580c" },
  { id: "biz_professionals", name: "Business Professionals", size: 2100000, avgCTR: 0.033, avgCVR: 0.025, color: "#0891b2" },
  { id: "fitness_enthusiasts", name: "Fitness Enthusiasts", size: 1700000, avgCTR: 0.045, avgCVR: 0.019, color: "#e11d48" },
  { id: "gamers", name: "Hardcore Gamers", size: 3100000, avgCTR: 0.055, avgCVR: 0.015, color: "#7c3aed" },
  { id: "retirees", name: "Active Retirees", size: 1400000, avgCTR: 0.022, avgCVR: 0.028, color: "#ca8a04" },
];

const MODELS = [
  { id: "two_tower", name: "Two-Tower Retrieval", latency: 5, coverage: 0.95, precision: 0.72, coldStart: 0.65 },
  { id: "gbdt", name: "GBDT Ranker", latency: 12, coverage: 0.78, precision: 0.88, coldStart: 0.45 },
  { id: "dlrm", name: "DLRM Deep Model", latency: 25, coverage: 0.85, precision: 0.92, coldStart: 0.38 },
  { id: "bandit", name: "Contextual Bandit", latency: 8, coverage: 0.82, precision: 0.68, coldStart: 0.82 },
];

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function generateAdvertisers(count = 80, seed = 42) {
  const rng = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const vertical = VERTICALS[Math.floor(rng() * VERTICALS.length)];
    const dailyBudget = 500 + rng() * 49500;
    const qualityScore = 0.3 + rng() * 0.7;
    const baseBid = 0.5 + rng() * 14.5;
    return {
      id: `adv_${i}`,
      name: `${vertical} Advertiser ${i + 1}`,
      vertical,
      dailyBudget: Math.round(dailyBudget),
      qualityScore: +qualityScore.toFixed(3),
      baseBid: +baseBid.toFixed(2),
      targetSegments: SEGMENTS.filter(() => rng() > 0.5).map(s => s.id),
      strategy: ["value_based", "roi_target", "budget_pacing"][Math.floor(rng() * 3)],
    };
  });
}

// ─── Auction Engine ─────────────────────────────────────────────────
function runGSPAuction(advertisers, segment, slots = 5, reservePrice = 0.5) {
  const eligible = advertisers.filter(a =>
    a.targetSegments.includes(segment.id) && a.baseBid >= reservePrice
  );
  const scored = eligible.map(a => ({
    ...a,
    effectiveBid: a.baseBid * a.qualityScore,
    pCTR: segment.avgCTR * (0.7 + a.qualityScore * 0.6),
  })).sort((a, b) => b.effectiveBid - a.effectiveBid);

  const winners = scored.slice(0, slots).map((w, i) => {
    const nextBid = scored[i + 1]?.effectiveBid || reservePrice;
    const price = Math.max(nextBid / w.qualityScore, reservePrice);
    return { ...w, slot: i + 1, price: +price.toFixed(4), cpc: +price.toFixed(4) };
  });

  const totalRevenue = winners.reduce((s, w) => s + w.price * w.pCTR * 1000, 0);
  const avgCPC = winners.length > 0 ? winners.reduce((s, w) => s + w.price, 0) / winners.length : 0;
  return { winners, totalRevenue: +totalRevenue.toFixed(2), avgCPC: +avgCPC.toFixed(4), mechanism: "GSP", eligible: eligible.length };
}

function runVCGAuction(advertisers, segment, slots = 5, reservePrice = 0.5) {
  const eligible = advertisers.filter(a =>
    a.targetSegments.includes(segment.id) && a.baseBid >= reservePrice
  );
  const scored = eligible.map(a => ({
    ...a,
    effectiveBid: a.baseBid * a.qualityScore,
    pCTR: segment.avgCTR * (0.7 + a.qualityScore * 0.6),
    value: a.baseBid * a.qualityScore * segment.avgCTR,
  })).sort((a, b) => b.effectiveBid - a.effectiveBid);

  const totalWelfareWithAll = scored.slice(0, slots).reduce((s, w) => s + w.value, 0);
  const winners = scored.slice(0, slots).map((w, i) => {
    const othersWithout = scored.filter((_, j) => j !== i).slice(0, slots);
    const welfareWithout = othersWithout.reduce((s, o) => s + o.value, 0);
    const othersWithH = scored.filter((_, j) => j !== i).slice(0, slots - 1);
    const welfareWithH = othersWithH.reduce((s, o) => s + o.value, 0);
    const externality = welfareWithout - welfareWithH;
    const price = Math.max(externality / w.qualityScore, reservePrice);
    return { ...w, slot: i + 1, price: +price.toFixed(4), cpc: +price.toFixed(4), externality: +externality.toFixed(4) };
  });

  const totalRevenue = winners.reduce((s, w) => s + w.price * w.pCTR * 1000, 0);
  const avgCPC = winners.length > 0 ? winners.reduce((s, w) => s + w.price, 0) / winners.length : 0;
  return { winners, totalRevenue: +totalRevenue.toFixed(2), avgCPC: +avgCPC.toFixed(4), mechanism: "VCG", eligible: eligible.length, socialWelfare: +totalWelfareWithAll.toFixed(2) };
}

// ─── Recommender Simulator ──────────────────────────────────────────
function simulateModelPerformance(model, segment, seed = 1) {
  const rng = seededRandom(seed + segment.id.length * 100 + model.id.length * 37);
  const segmentDensity = segment.size / 5000000;
  const baseLift = model.precision * (segmentDensity > 0.5 ? 1.1 : model.coldStart);
  const noise = (rng() - 0.5) * 0.15;
  const ctrLift = +(baseLift * (1 + noise)).toFixed(3);
  const revenueLift = +(ctrLift * (0.9 + rng() * 0.2) * model.coverage).toFixed(3);
  const latencyCost = model.latency * (1 + (1 - segmentDensity) * 0.3);
  return { model: model.id, modelName: model.name, segment: segment.id, ctrLift, revenueLift, latencyCost: +latencyCost.toFixed(1) };
}

function getModelRecommendation(segment) {
  const results = MODELS.map(m => simulateModelPerformance(m, segment));
  const best = results.sort((a, b) => b.revenueLift - a.revenueLift)[0];
  return { recommended: best.model, results, reason: getRoutingReason(best, segment) };
}

function getRoutingReason(best, segment) {
  if (segment.size < 1500000) return `${best.modelName} handles sparse segments well (cold-start resilience)`;
  if (best.model === "dlrm") return `${best.modelName} excels with deep features on high-density segment`;
  if (best.model === "gbdt") return `${best.modelName} provides best precision for ${segment.name}'s feature density`;
  return `${best.modelName} offers optimal coverage-precision tradeoff for this segment`;
}

// ─── What-If Engine ─────────────────────────────────────────────────
function runWhatIf(advertisers, params) {
  const { reservePrice = 0.5, slots = 5, mechanism = "GSP", segmentId = null, qualityFloor = 0 } = params;
  const filteredAds = advertisers.filter(a => a.qualityScore >= qualityFloor);
  const segments = segmentId ? SEGMENTS.filter(s => s.id === segmentId) : SEGMENTS;
  const auctionFn = mechanism === "VCG" ? runVCGAuction : runGSPAuction;

  let totalRev = 0, totalImpressions = 0, totalClicks = 0;
  const segmentResults = segments.map(seg => {
    const result = auctionFn(filteredAds, seg, slots, reservePrice);
    const impressions = seg.size * 0.1;
    const clicks = impressions * seg.avgCTR;
    totalRev += result.totalRevenue;
    totalImpressions += impressions;
    totalClicks += clicks;
    return { segment: seg.name, ...result, impressions: Math.round(impressions), clicks: Math.round(clicks) };
  });

  return { segmentResults, totalRevenue: +totalRev.toFixed(2), totalImpressions, totalClicks: Math.round(totalClicks), avgRPM: +(totalRev / (totalImpressions / 1000)).toFixed(4) };
}

// ─── Simulated LLM Responses ────────────────────────────────────────
const WHATIF_RESPONSES = {
  reserve: (params, baseline, scenario) => {
    const delta = scenario.totalRevenue - baseline.totalRevenue;
    const pct = ((delta / baseline.totalRevenue) * 100).toFixed(1);
    return `## Reserve Price Impact Analysis\n\nChanging reserve price from $0.50 to $${params.reservePrice}:\n\n**Revenue:** $${baseline.totalRevenue.toLocaleString()} → $${scenario.totalRevenue.toLocaleString()} (${delta > 0 ? '+' : ''}${pct}%)\n\n**Key Finding:** ${delta > 0 ? 'Higher reserve prices filter low-quality bids, increasing average CPC. However, watch for fill rate degradation in smaller segments like Active Retirees.' : 'Lower reserve prices increase fill rate but reduce CPCs. Consider segment-specific reserves rather than a blanket decrease.'}\n\n**Recommendation for IC6 discussion:** In a large-scale ad system, reserve prices are set per-auction using ML models that predict the "floor" below which showing an ad would degrade user experience. The revenue-optimal reserve is NOT the welfare-optimal reserve — this tension between monetization and user experience is a core Staff DS interview topic.`;
  },
  mechanism: (params, gsp, vcg) => {
    const delta = vcg.totalRevenue - gsp.totalRevenue;
    const pct = ((delta / gsp.totalRevenue) * 100).toFixed(1);
    return `## GSP vs VCG Mechanism Comparison\n\n| Metric | GSP | VCG |\n|--------|-----|-----|\n| Revenue | $${gsp.totalRevenue.toLocaleString()} | $${vcg.totalRevenue.toLocaleString()} |\n| Avg RPM | $${gsp.avgRPM} | $${vcg.avgRPM} |\n\n**Revenue delta:** ${delta > 0 ? '+' : ''}${pct}% with VCG\n\n**Key Insight:** GSP typically yields higher revenue than VCG because GSP is NOT truthful — advertisers bid above their true value due to the "next-price" payment rule. VCG charges externality-based prices that incentivize truthful bidding, leading to lower payments but higher allocative efficiency.\n\n**Industry context:** Large ad platforms use a modified GSP system. The IC6 interview often probes understanding of WHY GSP persists despite VCG\'s theoretical superiority: (1) revenue, (2) simplicity for advertisers, (3) equilibrium stability in repeated auctions.`;
  },
  model: (segName, rec) => {
    const results = rec.results.map(r => `- **${r.modelName}**: CTR lift ${r.ctrLift.toFixed(3)}, Revenue lift ${r.revenueLift.toFixed(3)}, Latency ${r.latencyCost}ms`).join('\n');
    return `## Recommender Model Analysis: ${segName}\n\n**Recommended model:** ${rec.results.find(r => r.model === rec.recommended)?.modelName}\n\n**Why:** ${rec.reason}\n\n### All Model Performance:\n${results}\n\n**Routing Logic:** The model router considers three factors: (1) segment data density for cold-start handling, (2) latency budget — mobile feed has a 30ms budget while stories has 50ms, (3) exploration vs exploitation tradeoff for new segments.\n\n**Staff-level insight:** In large-scale ad systems, model serving is done via a cascaded ranking system — lightweight retrieval (Two-Tower) → mid-funnel scoring (GBDT) → heavy ranker (DLRM). The IC6 question is: when should you skip stages? Answer: when expected revenue per impression is below the compute cost threshold.`;
  },
  quality: (params, baseline, scenario) => {
    const delta = scenario.totalRevenue - baseline.totalRevenue;
    const pct = ((delta / baseline.totalRevenue) * 100).toFixed(1);
    const removedCount = 80 - Math.round(80 * (1 - params.qualityFloor));
    return `## Quality Floor Impact\n\nSetting minimum quality score to ${params.qualityFloor} removes ~${removedCount} advertisers.\n\n**Revenue impact:** ${delta > 0 ? '+' : ''}${pct}%\n\n**Analysis:** ${delta > 0 ? 'Removing low-quality advertisers increases auction prices because remaining advertisers have higher effective bids. This also improves user experience.' : 'Filtering too aggressively reduces competition. In thin segments, this dramatically reduces fill rates.'}\n\n**IC6 angle:** Quality score in ad platforms is multidimensional: pCTR, pCVR, ad creative quality, landing page experience, and negative feedback prediction. A Staff DS should understand that quality scoring IS the recommender — it determines the ranking function for the ad auction.`;
  }
};

// ─── UI Components ──────────────────────────────────────────────────
const COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#e11d48", "#7c3aed", "#ca8a04"];

function MetricCard({ label, value, subtext, trend }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", minWidth: 180 }}>
      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginTop: 4, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{value}</div>
      {subtext && <div style={{ fontSize: 12, color: trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : "#6b7280", marginTop: 4 }}>{subtext}</div>}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb", marginBottom: 24 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "10px 20px", fontSize: 14, fontWeight: active === t.id ? 600 : 400,
          color: active === t.id ? "#1d4ed8" : "#6b7280", background: "none", border: "none",
          borderBottom: active === t.id ? "2px solid #1d4ed8" : "2px solid transparent",
          cursor: "pointer", marginBottom: -2, transition: "all 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function AuctionDashboard({ advertisers }) {
  const baseline = useMemo(() => runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "GSP" }), [advertisers]);
  const segmentRevenue = useMemo(() =>
    SEGMENTS.map((seg, i) => {
      const gsp = runGSPAuction(advertisers, seg);
      const vcg = runVCGAuction(advertisers, seg);
      return { name: seg.name.split(' ').slice(0, 2).join(' '), GSP: gsp.totalRevenue, VCG: vcg.totalRevenue, eligible: gsp.eligible, fill: seg.id };
    }), [advertisers]);

  const reserveSweep = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => {
      const rp = 0.1 + i * 0.25;
      const r = runWhatIf(advertisers, { reservePrice: rp, slots: 5, mechanism: "GSP" });
      return { reservePrice: +rp.toFixed(2), revenue: r.totalRevenue, rpm: r.avgRPM };
    }), [advertisers]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        <MetricCard label="Total Revenue" value={`$${baseline.totalRevenue.toLocaleString()}`} subtext="Per 1K impressions per segment" />
        <MetricCard label="Avg RPM" value={`$${baseline.avgRPM}`} subtext="Across all segments" />
        <MetricCard label="Total Clicks" value={baseline.totalClicks.toLocaleString()} subtext={`${baseline.totalImpressions.toLocaleString()} impressions`} />
        <MetricCard label="Advertisers" value={advertisers.length} subtext={`${VERTICALS.length} verticals`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16, marginTop: 0 }}>Revenue by Segment: GSP vs VCG</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={segmentRevenue} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `$${v.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="GSP" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="VCG" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16, marginTop: 0 }}>Revenue vs Reserve Price (GSP)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={reserveSweep} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="reservePrice" tick={{ fontSize: 11 }} label={{ value: "Reserve Price ($)", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `$${v.toFixed(2)}`} />
              <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16, marginTop: 0 }}>Auction Winners — Sample Segment: {SEGMENTS[0].name}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["Slot", "Advertiser", "Vertical", "Bid", "Quality", "Eff. Bid", "CPC", "pCTR"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runGSPAuction(advertisers, SEGMENTS[0]).winners.map((w, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>#{w.slot}</td>
                  <td style={{ padding: "8px 12px" }}>{w.name}</td>
                  <td style={{ padding: "8px 12px" }}><span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>{w.vertical}</span></td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>${w.baseBid.toFixed(2)}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{w.qualityScore.toFixed(3)}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 600 }}>${w.effectiveBid.toFixed(4)}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#16a34a" }}>${w.cpc}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{(w.pCTR * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SegmentExplorer() {
  const [selected, setSelected] = useState(SEGMENTS[0].id);
  const seg = SEGMENTS.find(s => s.id === selected);
  const rec = useMemo(() => getModelRecommendation(seg), [selected]);

  const radarData = rec.results.map(r => ({
    model: r.modelName.split(' ')[0],
    ctrLift: +(r.ctrLift * 100).toFixed(0),
    revLift: +(r.revenueLift * 100).toFixed(0),
    speed: +(100 - r.latencyCost).toFixed(0),
  }));

  const allSegRecs = useMemo(() => SEGMENTS.map(s => {
    const r = getModelRecommendation(s);
    const best = r.results.find(x => x.model === r.recommended);
    return { segment: s.name.split(' ').slice(0, 2).join(' '), model: best.modelName, revLift: best.revenueLift, ctrLift: best.ctrLift, latency: best.latencyCost, reason: r.reason };
  }), []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {SEGMENTS.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)} style={{
            padding: "6px 14px", fontSize: 13, borderRadius: 6, border: selected === s.id ? "2px solid #1d4ed8" : "1px solid #d1d5db",
            background: selected === s.id ? "#eff6ff" : "#fff", color: selected === s.id ? "#1d4ed8" : "#374151",
            cursor: "pointer", fontWeight: selected === s.id ? 600 : 400, transition: "all 0.15s",
          }}>{s.name}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Segment Size" value={seg.size.toLocaleString()} />
        <MetricCard label="Avg CTR" value={`${(seg.avgCTR * 100).toFixed(1)}%`} />
        <MetricCard label="Avg CVR" value={`${(seg.avgCVR * 100).toFixed(1)}%`} />
        <MetricCard label="Best Model" value={rec.results.find(r => r.model === rec.recommended)?.modelName.split(' ')[0]} subtext={rec.reason.substring(0, 60) + '...'} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16, marginTop: 0 }}>Model Performance Comparison</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rec.results} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="modelName" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="ctrLift" name="CTR Lift" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenueLift" name="Revenue Lift" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16, marginTop: 0 }}>Model Radar: {seg.name}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="model" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 10 }} />
              <Radar name="CTR Lift" dataKey="ctrLift" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
              <Radar name="Rev Lift" dataKey="revLift" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} />
              <Radar name="Speed" dataKey="speed" stroke="#ea580c" fill="#ea580c" fillOpacity={0.1} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16, marginTop: 0 }}>Segment → Model Routing Table</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              {["Segment", "Recommended Model", "Rev Lift", "CTR Lift", "Latency", "Routing Reason"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSegRecs.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: SEGMENTS[i].id === selected ? "#eff6ff" : "transparent" }}>
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>{r.segment}</td>
                <td style={{ padding: "8px 12px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{r.model}</span></td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{r.revLift.toFixed(3)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{r.ctrLift.toFixed(3)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{r.latency}ms</td>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "#6b7280" }}>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WhatIfChat({ advertisers }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: `Welcome to the **Ad Auction What-If Analyzer**. I can run simulations on the GSP/VCG auction system and analyze the impact on revenue, advertiser surplus, and segment performance.\n\nTry asking:\n- "What if we raise reserve prices to $2.00?"\n- "Compare GSP vs VCG mechanisms"\n- "Which model works best for College Students?"\n- "What if we set a quality floor of 0.5?"` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const processQuery = useCallback((query) => {
    const q = query.toLowerCase();
    const baseline = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "GSP" });

    if (q.includes("reserve") || q.includes("floor price") || q.includes("minimum bid")) {
      const match = query.match(/\$?([\d.]+)/);
      const rp = match ? parseFloat(match[1]) : 2.0;
      const scenario = runWhatIf(advertisers, { reservePrice: rp, slots: 5, mechanism: "GSP" });
      return WHATIF_RESPONSES.reserve({ reservePrice: rp }, baseline, scenario);
    }
    if (q.includes("gsp") || q.includes("vcg") || q.includes("mechanism") || q.includes("compare")) {
      const gsp = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "GSP" });
      const vcg = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "VCG" });
      return WHATIF_RESPONSES.mechanism({}, gsp, vcg);
    }
    if (q.includes("model") || q.includes("recommender") || q.includes("which")) {
      const segMatch = SEGMENTS.find(s => q.includes(s.name.toLowerCase()) || q.includes(s.id.replace('_', ' ')));
      const seg = segMatch || SEGMENTS[3];
      const rec = getModelRecommendation(seg);
      return WHATIF_RESPONSES.model(seg.name, rec);
    }
    if (q.includes("quality") || q.includes("filter") || q.includes("remove")) {
      const match = query.match(/([\d.]+)/);
      const qf = match ? parseFloat(match[1]) : 0.5;
      const qualityFloor = qf > 1 ? qf / 100 : qf;
      const scenario = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "GSP", qualityFloor });
      return WHATIF_RESPONSES.quality({ qualityFloor }, baseline, scenario);
    }
    return `I can help analyze auction dynamics. Try:\n\n1. **Reserve prices**: "What if reserve price is $3.00?"\n2. **Mechanism comparison**: "Compare GSP vs VCG"\n3. **Model routing**: "Which model is best for Luxury Shoppers?"\n4. **Quality filtering**: "What if we set quality floor to 0.6?"\n\nIn the full version, this is powered by Claude API with tool-use for arbitrary natural-language queries.`;
  }, [advertisers]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      const response = processQuery(userMsg);
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      setLoading(false);
    }, 800);
  };

  const renderMarkdown = (text) => {
    return text
      .replace(/## (.*)/g, '<h3 style="font-size:15px;font-weight:700;color:#111827;margin:12px 0 8px">$1</h3>')
      .replace(/### (.*)/g, '<h4 style="font-size:13px;font-weight:600;color:#374151;margin:10px 0 6px">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n- (.*)/g, '<br/>• $1')
      .replace(/\n(\d+)\. (.*)/g, '<br/>$1. $2')
      .replace(/\|(.+)\|/g, (match) => {
        const cells = match.split('|').filter(c => c.trim());
        if (cells.every(c => c.trim().match(/^[-]+$/))) return '';
        return '<div style="display:flex;gap:16px;font-size:12px;font-family:monospace;padding:2px 0">' + cells.map(c => `<span style="min-width:80px">${c.trim()}</span>`).join('') + '</div>';
      });
  };

  const suggestions = ["What if reserve price is $2.50?", "Compare GSP vs VCG", "Which model for Gamers?", "Quality floor 0.6"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600 }}>
      <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: m.role === "user" ? "70%" : "90%",
            background: m.role === "user" ? "#1d4ed8" : "#f9fafb",
            color: m.role === "user" ? "#fff" : "#111827",
            border: m.role === "user" ? "none" : "1px solid #e5e7eb",
            borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.6,
          }}>
            {m.role === "assistant" ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
            ) : m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", fontSize: 13 }}>
            <span style={{ animation: "pulse 1.5s infinite" }}>Analyzing auction dynamics...</span>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 0" }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => { setInput(s); }} style={{
              padding: "6px 12px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6,
              background: "#fff", color: "#374151", cursor: "pointer",
            }}>{s}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder="Ask a what-if question about the auction system..."
          style={{
            flex: 1, padding: "10px 14px", fontSize: 14, border: "1px solid #d1d5db",
            borderRadius: 8, outline: "none",
          }}
        />
        <button onClick={handleSend} style={{
          padding: "10px 20px", fontSize: 14, fontWeight: 600, background: "#1d4ed8",
          color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
        }}>Send</button>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────
export default function App() {
  const advertisers = useMemo(() => generateAdvertisers(80, 42), []);
  const [tab, setTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Auction Dashboard" },
    { id: "segments", label: "Segment Explorer" },
    { id: "whatif", label: "What-If Analysis" },
  ];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px 32px" }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
            Ad Auction Simulator
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            GSP/VCG Auction Engine · Recommender Model Routing · LLM-Powered What-If Analysis
          </p>
        </div>

        <TabBar tabs={tabs} active={tab} onChange={setTab} />

        {tab === "dashboard" && <AuctionDashboard advertisers={advertisers} />}
        {tab === "segments" && <SegmentExplorer />}
        {tab === "whatif" && <WhatIfChat advertisers={advertisers} />}
      </div>
    </div>
  );
}
