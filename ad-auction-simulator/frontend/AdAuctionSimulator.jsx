import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ScatterChart, Scatter, Cell, Area, AreaChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart,
  PieChart, Pie
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

const HOURLY_MULTIPLIERS = {
  young_tech:       [0.3,0.2,0.1,0.1,0.1,0.2,0.4,0.7,0.9,1.0,1.0,0.9,0.8,0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5,1.4,1.0,0.6],
  suburban_parents: [0.2,0.1,0.1,0.1,0.1,0.2,0.5,0.8,1.0,1.2,1.1,1.0,0.9,0.8,0.9,1.0,1.1,1.0,0.8,0.9,1.2,1.3,0.8,0.4],
  college_students: [0.4,0.3,0.2,0.1,0.1,0.1,0.2,0.4,0.6,0.8,1.0,1.1,1.2,1.2,1.3,1.3,1.2,1.1,1.0,1.1,1.3,1.5,1.4,0.8],
  biz_professionals:[0.1,0.1,0.1,0.1,0.1,0.2,0.4,0.8,1.2,1.4,1.3,1.2,1.0,1.1,1.3,1.2,1.0,0.8,0.6,0.5,0.4,0.3,0.2,0.1],
};

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
      id: `adv_${i}`, name: `${vertical} Advertiser ${i + 1}`, vertical,
      dailyBudget: Math.round(dailyBudget), qualityScore: +qualityScore.toFixed(3),
      baseBid: +baseBid.toFixed(2),
      targetSegments: SEGMENTS.filter(() => rng() > 0.5).map(s => s.id),
      strategy: ["value_based", "roi_target", "budget_pacing"][Math.floor(rng() * 3)],
    };
  });
}

// ─── Auction Engine ─────────────────────────────────────────────────
function runGSPAuction(advertisers, segment, slots = 5, reservePrice = 0.5, remainingBudgets = null) {
  const eligible = advertisers.filter(a =>
    a.targetSegments.includes(segment.id) && a.baseBid >= reservePrice &&
    (!remainingBudgets || (remainingBudgets[a.id] || a.dailyBudget) > 0)
  );
  const scored = eligible.map(a => {
    let bid = a.baseBid;
    if (remainingBudgets) {
      const remaining = remainingBudgets[a.id] ?? a.dailyBudget;
      const ratio = remaining / a.dailyBudget;
      bid *= (0.5 + 0.5 * ratio); // bid shading
    }
    return { ...a, adjustedBid: bid, effectiveBid: bid * a.qualityScore, pCTR: segment.avgCTR * (0.7 + a.qualityScore * 0.6) };
  }).sort((a, b) => b.effectiveBid - a.effectiveBid);

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
  const eligible = advertisers.filter(a => a.targetSegments.includes(segment.id) && a.baseBid >= reservePrice);
  const scored = eligible.map(a => ({ ...a, effectiveBid: a.baseBid * a.qualityScore, pCTR: segment.avgCTR * (0.7 + a.qualityScore * 0.6), value: a.baseBid * a.qualityScore * segment.avgCTR })).sort((a, b) => b.effectiveBid - a.effectiveBid);
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
  return { winners, totalRevenue: +totalRevenue.toFixed(2), avgCPC: +avgCPC.toFixed(4), mechanism: "VCG", eligible: eligible.length };
}

// ─── Budget Pacing Simulation ────────────────────────────────────────
function simulatePacing(advertisers, segment) {
  const budgets = {};
  advertisers.forEach(a => { budgets[a.id] = a.dailyBudget; });
  const hourly = [];
  const multipliers = HOURLY_MULTIPLIERS[segment.id] || Array(24).fill(1);

  for (let hour = 0; hour < 24; hour++) {
    const mult = multipliers[hour];
    const reserve = 0.5 * (0.8 + 0.4 * mult);
    const result = runGSPAuction(advertisers, segment, 5, reserve, budgets);
    result.winners.forEach(w => {
      budgets[w.id] = Math.max(0, (budgets[w.id] || 0) - w.price * 10);
    });
    const activeCount = Object.values(budgets).filter(b => b > 0).length;
    const avgBudget = Object.values(budgets).reduce((s, b) => s + b, 0) / Object.values(budgets).length;
    hourly.push({
      hour, time: `${String(hour).padStart(2, '0')}:00`, multiplier: mult,
      reserve: +reserve.toFixed(3), revenue: result.totalRevenue,
      avgCPC: result.avgCPC, fillRate: result.winners.length / 5,
      activeAdvertisers: activeCount, avgBudgetRemaining: +avgBudget.toFixed(0),
    });
  }
  return hourly;
}

function simulateAdversarialPacing(advertisers, segment, whalePct = 0.15) {
  // Whales = top spenders who detect reserve price patterns and exploit cheap windows
  const sorted = [...advertisers].sort((a, b) => b.dailyBudget - a.dailyBudget);
  const whaleCount = Math.max(1, Math.floor(sorted.length * whalePct));
  const whaleIds = new Set(sorted.slice(0, whaleCount).map(a => a.id));
  const multipliers = HOURLY_MULTIPLIERS[segment.id] || Array(24).fill(1);

  // First pass: compute reserve price pattern
  const reserves = multipliers.map(m => 0.5 * (0.8 + 0.4 * m));
  const minReserve = Math.min(...reserves);
  const maxReserve = Math.max(...reserves);
  const reserveRange = maxReserve - minReserve || 1;

  // Second pass: whales shift bids to cheap hours
  const budgets = {};
  advertisers.forEach(a => { budgets[a.id] = a.dailyBudget; });
  const hourly = [];

  for (let hour = 0; hour < 24; hour++) {
    const reserve = reserves[hour];
    const cheapness = 1 - (reserve - minReserve) / reserveRange;

    // Whales increase effective budget in cheap hours, decrease in expensive ones
    const advBudgets = { ...budgets };
    whaleIds.forEach(wid => {
      if (advBudgets[wid] > 0) {
        advBudgets[wid] = budgets[wid] * (0.5 + 1.5 * cheapness);
      }
    });

    const result = runGSPAuction(advertisers, segment, 5, reserve, advBudgets);
    result.winners.forEach(w => {
      budgets[w.id] = Math.max(0, (budgets[w.id] || 0) - w.price * 10);
    });
    hourly.push({
      hour, time: `${String(hour).padStart(2, '0')}:00`,
      revenue: result.totalRevenue, whaleActivity: +cheapness.toFixed(3),
    });
  }

  const totalRev = hourly.reduce((s, h) => s + h.revenue, 0);
  return { hourly, totalRevenue: totalRev, whaleCount };
}

// ─── Quality Feedback Simulation ─────────────────────────────────────
function simulateQualityFeedback(advertisers, segment, rounds = 10) {
  const advs = advertisers.map(a => ({ ...a, qualityScore: a.qualityScore }));
  const trajectory = [];
  const qualityHistory = {};
  advs.forEach(a => { qualityHistory[a.id] = [a.qualityScore]; });

  for (let r = 0; r < rounds; r++) {
    const result = runGSPAuction(advs, segment);
    const qualities = advs.map(a => a.qualityScore);
    const mean = qualities.reduce((s, q) => s + q, 0) / qualities.length;
    const std = Math.sqrt(qualities.reduce((s, q) => s + (q - mean) ** 2, 0) / qualities.length);

    result.winners.forEach(w => {
      const adv = advs.find(a => a.id === w.id);
      if (adv) {
        const noise = (Math.random() - 0.5) * 0.2;
        const actualCTR = w.pCTR * (1 + noise);
        const error = actualCTR - w.pCTR;
        adv.qualityScore = Math.max(0.1, Math.min(1.0, adv.qualityScore + error * 0.05));
        qualityHistory[adv.id].push(adv.qualityScore);
      }
    });

    trajectory.push({
      round: r + 1, revenue: result.totalRevenue, avgCPC: result.avgCPC,
      qualityMean: +mean.toFixed(4), qualityStd: +std.toFixed(4),
      highQuality: qualities.filter(q => q > 0.7).length,
      lowQuality: qualities.filter(q => q < 0.3).length,
    });
  }

  // Find top improvers and decliners
  const changes = advs.map((a, i) => ({
    name: a.name.substring(0, 25), vertical: a.vertical,
    initial: advertisers[i].qualityScore,
    final: a.qualityScore,
    delta: +(a.qualityScore - advertisers[i].qualityScore).toFixed(4),
  })).sort((a, b) => b.delta - a.delta);

  return { trajectory, topImprovers: changes.slice(0, 5), topDecliners: changes.slice(-5).reverse() };
}

// ─── Thompson Sampling Simulation ────────────────────────────────────
function simulateThompsonSampling(segment, numTrials = 100) {
  const trueRates = [0.55, 0.45, 0.72, 0.50]; // DLRM is best
  const arms = MODELS.map((m, i) => ({ name: m.name, successes: 0, failures: 0, alpha: 1, beta: 1, trueRate: trueRates[i] }));

  function betaSample(a, b) {
    let x = 0, y = 0;
    for (let i = 0; i < a; i++) x -= Math.log(Math.random());
    for (let i = 0; i < b; i++) y -= Math.log(Math.random());
    return x / (x + y);
  }

  const dayResults = [];
  let cumReward = 0, optReward = 0;
  const bestRate = Math.max(...trueRates);
  const selectionCounts = MODELS.map(() => 0);

  for (let day = 0; day < numTrials; day++) {
    const samples = arms.map(a => betaSample(a.alpha + a.successes, a.beta + a.failures));
    const selected = samples.indexOf(Math.max(...samples));
    const success = Math.random() < arms[selected].trueRate;
    if (success) arms[selected].successes++;
    else arms[selected].failures++;
    cumReward += success ? 1 : 0;
    optReward += bestRate;
    selectionCounts[selected]++;

    const recentWindow = dayResults.slice(-20);
    const bestIdx = arms.indexOf(arms.reduce((best, a) => (a.successes / Math.max(a.successes + a.failures, 1)) > (best.successes / Math.max(best.successes + best.failures, 1)) ? a : best));
    const recentExploration = recentWindow.length > 0 ? recentWindow.filter(d => d.selectedIdx !== bestIdx).length / recentWindow.length : 1;

    dayResults.push({
      day: day + 1, selectedModel: arms[selected].name, selectedIdx: selected,
      success, cumReward, optReward: +optReward.toFixed(1),
      regret: +(optReward - cumReward).toFixed(2),
      explorationRate: +recentExploration.toFixed(3),
    });
  }

  return {
    dayResults, arms: arms.map((a, i) => ({
      name: a.name, successes: a.successes, failures: a.failures,
      posteriorMean: +((a.alpha + a.successes) / (a.alpha + a.beta + a.successes + a.failures)).toFixed(4),
      trueRate: a.trueRate, selectionPct: +(selectionCounts[i] / numTrials * 100).toFixed(1),
    })),
    totalRegret: +(optReward - cumReward).toFixed(2),
    regretPct: +((optReward - cumReward) / optReward * 100).toFixed(1),
  };
}

// ─── Cascade Ranking Simulation ──────────────────────────────────────
function simulateCascade(advertisers, segment) {
  // Stage 1: Retrieval
  const retrieved = advertisers.filter(a => a.targetSegments.includes(segment.id));
  const retrievalK = Math.min(retrieved.length, 100);

  // Stage 2: Ranking (sort by quality × bid)
  const ranked = [...retrieved].sort((a, b) => (b.qualityScore * b.baseBid) - (a.qualityScore * a.baseBid)).slice(0, 20);

  // Stage 3: Re-ranking (diversity + quality floor)
  const verticalCounts = {};
  const reranked = [];
  for (const a of ranked) {
    if (a.qualityScore < 0.35) continue;
    const vc = verticalCounts[a.vertical] || 0;
    if (vc < 2) { reranked.push(a); verticalCounts[a.vertical] = vc + 1; }
    if (reranked.length >= 15) break;
  }

  const cascadeResult = runGSPAuction(reranked, segment);
  const singleResult = runGSPAuction(advertisers, segment);

  const cascadeCompute = retrieved.length * 0.01 + retrievalK * 1.0 + ranked.length * 0.05;
  const singleCompute = advertisers.length * 1.0;
  const savings = (1 - cascadeCompute / singleCompute) * 100;
  const revDiff = ((cascadeResult.totalRevenue - singleResult.totalRevenue) / Math.max(singleResult.totalRevenue, 0.01)) * 100;

  // Latency-to-conversion analysis: ~1% conversion drop per 100ms
  const cascadeLatencyMs = 5 + 25 + 2; // 32ms
  const singleLatencyMs = Math.min(80, 25 + advertisers.length * 0.3);
  const CONV_LOSS_PER_100MS = 0.01;
  const cascadeConvLoss = (cascadeLatencyMs / 100) * CONV_LOSS_PER_100MS;
  const singleConvLoss = (singleLatencyMs / 100) * CONV_LOSS_PER_100MS;
  const cascadeNetRev = cascadeResult.totalRevenue * (1 - cascadeConvLoss);
  const singleNetRev = singleResult.totalRevenue * (1 - singleConvLoss);

  return {
    stages: [
      { name: "Retrieval", model: "Two-Tower", input: advertisers.length, output: retrievalK, compute: +(retrieved.length * 0.01).toFixed(1), latency: "5ms" },
      { name: "Ranking", model: "DLRM", input: retrievalK, output: ranked.length, compute: +(retrievalK * 1.0).toFixed(1), latency: "25ms" },
      { name: "Re-ranking", model: "Business Rules", input: ranked.length, output: reranked.length, compute: +(ranked.length * 0.05).toFixed(1), latency: "2ms" },
    ],
    cascade: { revenue: cascadeResult.totalRevenue, avgCPC: cascadeResult.avgCPC, winners: cascadeResult.winners.length, compute: +cascadeCompute.toFixed(1) },
    singleStage: { revenue: singleResult.totalRevenue, avgCPC: singleResult.avgCPC, winners: singleResult.winners.length, compute: +singleCompute.toFixed(1) },
    savings: +savings.toFixed(1),
    revDiff: +revDiff.toFixed(1),
    revPerCompute: { cascade: +(cascadeResult.totalRevenue / Math.max(cascadeCompute, 1)).toFixed(2), single: +(singleResult.totalRevenue / Math.max(singleCompute, 1)).toFixed(2) },
    latency: {
      cascadeMs: cascadeLatencyMs,
      singleMs: +singleLatencyMs.toFixed(0),
      cascadeConvLossPct: +(cascadeConvLoss * 100).toFixed(2),
      singleConvLossPct: +(singleConvLoss * 100).toFixed(2),
      cascadeNetRev: +cascadeNetRev.toFixed(2),
      singleNetRev: +singleNetRev.toFixed(2),
      netAdvantage: +(cascadeNetRev - singleNetRev).toFixed(2),
      latencyChangesWinner: (cascadeNetRev - singleNetRev) > 0 && revDiff <= 0,
    },
  };
}

// ─── Recommender / What-If (original) ────────────────────────────────
function simulateModelPerformance(model, segment, seed = 1) {
  const rng = seededRandom(seed + segment.id.length * 100 + model.id.length * 37);
  const segmentDensity = segment.size / 5000000;
  const baseLift = model.precision * (segmentDensity > 0.5 ? 1.1 : model.coldStart);
  const noise = (rng() - 0.5) * 0.15;
  const ctrLift = +(baseLift * (1 + noise)).toFixed(3);
  const revenueLift = +(ctrLift * (0.9 + rng() * 0.2) * model.coverage).toFixed(3);
  return { model: model.id, modelName: model.name, segment: segment.id, ctrLift, revenueLift, latencyCost: +(model.latency * (1 + (1 - segmentDensity) * 0.3)).toFixed(1) };
}

function getModelRecommendation(segment) {
  const results = MODELS.map(m => simulateModelPerformance(m, segment));
  const best = results.sort((a, b) => b.revenueLift - a.revenueLift)[0];
  return { recommended: best.model, results, reason: best.modelName + (segment.size < 1500000 ? " handles sparse segments well" : " provides optimal precision-coverage tradeoff") };
}

function runWhatIf(advertisers, params) {
  const { reservePrice = 0.5, slots = 5, mechanism = "VCG", segmentId = null, qualityFloor = 0 } = params;
  const filteredAds = advertisers.filter(a => a.qualityScore >= qualityFloor);
  const segments = segmentId ? SEGMENTS.filter(s => s.id === segmentId) : SEGMENTS;
  const auctionFn = mechanism === "VCG" ? runVCGAuction : runGSPAuction;
  let totalRev = 0, totalImpressions = 0, totalClicks = 0;
  const segmentResults = segments.map(seg => {
    const result = auctionFn(filteredAds, seg, slots, reservePrice);
    const impressions = seg.size * 0.1; const clicks = impressions * seg.avgCTR;
    totalRev += result.totalRevenue; totalImpressions += impressions; totalClicks += clicks;
    return { segment: seg.name, ...result, impressions: Math.round(impressions), clicks: Math.round(clicks) };
  });
  return { segmentResults, totalRevenue: +totalRev.toFixed(2), totalImpressions, totalClicks: Math.round(totalClicks), avgRPM: +(totalRev / (totalImpressions / 1000)).toFixed(4) };
}

// ─── UI Components ──────────────────────────────────────────────────
const COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#e11d48", "#7c3aed", "#ca8a04"];

function MetricCard({ label, value, subtext, trend, highlight }) {
  return (
    <div style={{ background: highlight ? "#eff6ff" : "#fff", border: `1px solid ${highlight ? "#93c5fd" : "#e5e7eb"}`, borderRadius: 8, padding: "16px 20px", minWidth: 160 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#111827", marginTop: 4, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{value}</div>
      {subtext && <div style={{ fontSize: 11, color: trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : "#6b7280", marginTop: 4 }}>{subtext}</div>}
    </div>
  );
}

function SectionCard({ title, children, description }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 0 }}>{title}</h3>
      {description && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>{description}</p>}
      {children}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb", marginBottom: 24, overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "10px 16px", fontSize: 13, fontWeight: active === t.id ? 600 : 400, whiteSpace: "nowrap",
          color: active === t.id ? "#1d4ed8" : "#6b7280", background: "none", border: "none",
          borderBottom: active === t.id ? "2px solid #1d4ed8" : "2px solid transparent",
          cursor: "pointer", marginBottom: -2, transition: "all 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function InsightBox({ title, content, type = "info" }) {
  const colors = { info: { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" }, success: { bg: "#f0fdf4", border: "#86efac", text: "#166534" }, warning: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" } };
  const c = colors[type];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "12px 16px", marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: c.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: c.text, lineHeight: 1.5 }}>{content}</div>
    </div>
  );
}

// ─── Tab: Auction Dashboard ──────────────────────────────────────────
function AuctionDashboard({ advertisers }) {
  const baseline = useMemo(() => runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "VCG" }), [advertisers]);
  const segmentRevenue = useMemo(() =>
    SEGMENTS.map(seg => {
      const vcg = runVCGAuction(advertisers, seg); const gsp = runGSPAuction(advertisers, seg);
      return { name: seg.name.split(' ').slice(0, 2).join(' '), VCG: vcg.totalRevenue, GSP: gsp.totalRevenue, eligible: vcg.eligible };
    }), [advertisers]);
  const reserveSweep = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => {
      const rp = 0.1 + i * 0.25;
      const r = runWhatIf(advertisers, { reservePrice: rp, slots: 5, mechanism: "VCG" });
      return { reservePrice: +rp.toFixed(2), revenue: r.totalRevenue, rpm: r.avgRPM };
    }), [advertisers]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Total Revenue" value={`$${baseline.totalRevenue.toLocaleString()}`} subtext="Per 1K impressions/segment" />
        <MetricCard label="Avg RPM" value={`$${baseline.avgRPM}`} subtext="Across all segments" />
        <MetricCard label="Total Clicks" value={baseline.totalClicks.toLocaleString()} subtext={`${baseline.totalImpressions.toLocaleString()} impressions`} />
        <MetricCard label="Advertisers" value={advertisers.length} subtext={`${VERTICALS.length} verticals`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <SectionCard title="Revenue by Segment: VCG vs GSP">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={segmentRevenue}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={v => `$${v.toFixed(2)}`} /><Legend /><Bar dataKey="VCG" fill="#7c3aed" radius={[4,4,0,0]} /><Bar dataKey="GSP" fill="#2563eb" radius={[4,4,0,0]} /></BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Revenue vs Reserve Price (VCG)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={reserveSweep}><defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="reservePrice" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={v => `$${v.toFixed(2)}`} /><Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revGrad)" /></AreaChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
      <SectionCard title={`Auction Winners — ${SEGMENTS[0].name}`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>{["Slot","Advertiser","Vertical","Bid","Quality","Eff. Bid","CPC","pCTR"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#6b7280", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>{runVCGAuction(advertisers, SEGMENTS[0]).winners.map((w, i) => <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}><td style={{ padding: "8px 10px", fontWeight: 600 }}>#{w.slot}</td><td style={{ padding: "8px 10px" }}>{w.name}</td><td style={{ padding: "8px 10px" }}><span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 4, fontSize: 10 }}>{w.vertical}</span></td><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>${w.baseBid.toFixed(2)}</td><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{w.qualityScore.toFixed(3)}</td><td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 600 }}>${w.effectiveBid.toFixed(4)}</td><td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#16a34a" }}>${w.cpc}</td><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{(w.pCTR * 100).toFixed(2)}%</td></tr>)}</tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Budget Pacing ──────────────────────────────────────────────
function BudgetPacingTab({ advertisers }) {
  const [segId, setSegId] = useState("young_tech");
  const seg = SEGMENTS.find(s => s.id === segId);
  const data = useMemo(() => simulatePacing(advertisers, seg), [advertisers, segId]);
  const adversarial = useMemo(() => simulateAdversarialPacing(advertisers, seg), [advertisers, segId]);
  const peakHour = data.reduce((best, d) => d.revenue > best.revenue ? d : best, data[0]);
  const lowHour = data.reduce((best, d) => d.revenue < best.revenue ? d : best, data[0]);
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const erosion = totalRev - adversarial.totalRevenue;
  const erosionPct = ((erosion / Math.max(totalRev, 0.01)) * 100).toFixed(1);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {SEGMENTS.slice(0, 4).map(s => <button key={s.id} onClick={() => setSegId(s.id)} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: segId === s.id ? "2px solid #1d4ed8" : "1px solid #d1d5db", background: segId === s.id ? "#eff6ff" : "#fff", color: segId === s.id ? "#1d4ed8" : "#374151", cursor: "pointer", fontWeight: segId === s.id ? 600 : 400 }}>{s.name.split(' ').slice(0, 2).join(' ')}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="24h Revenue" value={`$${totalRev.toFixed(0)}`} highlight />
        <MetricCard label="Peak Hour" value={peakHour.time} subtext={`$${peakHour.revenue.toFixed(0)} revenue`} trend="up" />
        <MetricCard label="Low Hour" value={lowHour.time} subtext={`$${lowHour.revenue.toFixed(0)} revenue`} trend="down" />
        <MetricCard label="Reserve Range" value={`${data[0].reserve.toFixed(2)}-${Math.max(...data.map(d => d.reserve)).toFixed(2)}`} subtext={`${(Math.max(...data.map(d => d.reserve)) / Math.min(...data.map(d => d.reserve))).toFixed(1)}x variation`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Hourly Revenue & Reserve Price" description="Budget depletion creates scarcity, pushing optimal reserves higher through the day">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="time" tick={{ fontSize: 10 }} interval={2} /><YAxis yAxisId="left" tick={{ fontSize: 10 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} /><Tooltip /><Bar yAxisId="left" dataKey="revenue" fill="#2563eb" radius={[3,3,0,0]} name="Revenue ($)" /><Line yAxisId="right" type="monotone" dataKey="reserve" stroke="#dc2626" strokeWidth={2} dot={false} name="Reserve Price ($)" /></ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Active Advertisers & Budget Depletion" description="As budgets deplete, competition thins — a key pacing dynamic">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="time" tick={{ fontSize: 10 }} interval={2} /><YAxis yAxisId="left" tick={{ fontSize: 10 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} /><Tooltip /><Line yAxisId="left" type="monotone" dataKey="activeAdvertisers" stroke="#16a34a" strokeWidth={2} name="Active Advertisers" /><Area yAxisId="right" type="monotone" dataKey="avgBudgetRemaining" stroke="#9333ea" fill="#9333ea" fillOpacity={0.1} name="Avg Budget ($)" /></ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
      {/* Adversarial Gaming Analysis */}
      <SectionCard title="Adversarial Behavior: Whale Gaming Analysis" description={`What happens when ${adversarial.whaleCount} top-spending advertisers (15%) detect the reserve price pattern and shift bids to exploit cheap windows?`}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data.map((d, i) => ({ time: d.time, naive: d.revenue, adversarial: adversarial.hourly[i]?.revenue || 0, whaleActivity: (adversarial.hourly[i]?.whaleActivity || 0) * 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="naive" fill="#2563eb" name="Naive Revenue ($)" opacity={0.4} radius={[2,2,0,0]} />
                <Bar dataKey="adversarial" fill="#dc2626" name="Adversarial Revenue ($)" radius={[2,2,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#eff6ff", borderRadius: 8, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b7280" }}>Naive Revenue</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>${totalRev.toFixed(0)}</div>
              </div>
              <div style={{ background: "#fef2f2", borderRadius: 8, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b7280" }}>Under Adversarial Gaming</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>${adversarial.totalRevenue.toFixed(0)}</div>
              </div>
            </div>
            <div style={{ background: erosion > 0 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${erosion > 0 ? "#fca5a5" : "#86efac"}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: erosion > 0 ? "#dc2626" : "#16a34a" }}>Revenue Erosion: ${Math.abs(erosion).toFixed(0)} ({erosionPct}%)</div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>When whales shift bids to exploit cheap windows</div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10, color: "#374151" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Mitigation Strategies:</div>
              <div>1. Randomized reserve perturbation (add noise)</div>
              <div>2. Per-advertiser personalized floors</div>
              <div>3. Minimum 24h budget spread constraints</div>
              <div>4. Whale detection (flag high bid variance)</div>
            </div>
          </div>
        </div>
      </SectionCard>
      <InsightBox type="warning" title="Key Insight: Adversarial Dynamics" content={`Advertisers aren't passive. When reserve prices vary ${(Math.max(...data.map(d => d.reserve)) / Math.min(...data.map(d => d.reserve))).toFixed(1)}x by time of day, sophisticated whales (${adversarial.whaleCount} advertisers, 15% of pool) can detect the pattern and shift bids to cheaper windows, eroding ${erosionPct}% of revenue. Production systems must balance dynamic pricing with adversarial robustness — randomized perturbation, personalized reserves, and minimum spend constraints prevent gaming while preserving most of the pacing revenue gains.`} />
    </div>
  );
}

// ─── Tab: Quality Feedback Loop ──────────────────────────────────────
function QualityFeedbackTab({ advertisers }) {
  const [rounds, setRounds] = useState(10);
  const seg = SEGMENTS[0];
  const data = useMemo(() => simulateQualityFeedback(advertisers, seg, rounds), [advertisers, rounds]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#374151" }}>Simulation rounds:</span>
        {[5, 10, 20, 50].map(r => <button key={r} onClick={() => setRounds(r)} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: rounds === r ? "2px solid #1d4ed8" : "1px solid #d1d5db", background: rounds === r ? "#eff6ff" : "#fff", cursor: "pointer", fontWeight: rounds === r ? 600 : 400, color: rounds === r ? "#1d4ed8" : "#374151" }}>{r} rounds</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Initial Std Dev" value={data.trajectory[0]?.qualityStd.toFixed(4)} />
        <MetricCard label="Final Std Dev" value={data.trajectory[data.trajectory.length - 1]?.qualityStd.toFixed(4)} subtext="Higher = more divergence" trend="up" highlight />
        <MetricCard label="High Quality" value={data.trajectory[data.trajectory.length - 1]?.highQuality} subtext={`Started: ${data.trajectory[0]?.highQuality}`} />
        <MetricCard label="Low Quality" value={data.trajectory[data.trajectory.length - 1]?.lowQuality} subtext={`Started: ${data.trajectory[0]?.lowQuality}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Quality Score Divergence Over Rounds" description="Standard deviation increases as high-quality ads strengthen and low-quality ads weaken">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.trajectory}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="round" tick={{ fontSize: 11 }} /><YAxis yAxisId="left" tick={{ fontSize: 10 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} /><Tooltip /><Line yAxisId="left" type="monotone" dataKey="qualityStd" stroke="#dc2626" strokeWidth={2} name="Quality Std Dev" /><Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} name="Revenue ($)" /></ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Revenue Trajectory Across Rounds" description="Revenue stabilizes as quality scores reach equilibrium">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.trajectory}><defs><linearGradient id="revFeedback" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} /><stop offset="95%" stopColor="#16a34a" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="round" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="url(#revFeedback)" strokeWidth={2} /></AreaChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="Top 5 Improvers (Virtuous Cycle)">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>{["Advertiser","Vertical","Initial","Final","Delta"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#6b7280", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>{data.topImprovers.map((a, i) => <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}><td style={{ padding: "6px 10px" }}>{a.name}</td><td style={{ padding: "6px 10px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>{a.vertical}</span></td><td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{a.initial.toFixed(3)}</td><td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{a.final.toFixed(3)}</td><td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#16a34a", fontWeight: 600 }}>+{a.delta.toFixed(4)}</td></tr>)}</tbody>
          </table>
        </SectionCard>
        <SectionCard title="Top 5 Decliners (Death Spiral)">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>{["Advertiser","Vertical","Initial","Final","Delta"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#6b7280", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>{data.topDecliners.map((a, i) => <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}><td style={{ padding: "6px 10px" }}>{a.name}</td><td style={{ padding: "6px 10px" }}><span style={{ background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>{a.vertical}</span></td><td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{a.initial.toFixed(3)}</td><td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{a.final.toFixed(3)}</td><td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#dc2626", fontWeight: 600 }}>{a.delta.toFixed(4)}</td></tr>)}</tbody>
          </table>
        </SectionCard>
      </div>
      <InsightBox type="warning" title="Systems Insight: Quality Feedback Loop" content="Quality scores are ENDOGENOUS to auction outcomes. High-quality ads win impressions → generate CTR data → improve pCTR predictions → quality rises (virtuous cycle). Low-quality ads lose impressions → sparse data → stale predictions → quality decays (death spiral). Understanding this feedback loop is essential for equilibrium analysis and advertiser lifecycle management." />
    </div>
  );
}

// ─── Tab: Exploration-Exploitation (Thompson Sampling) ───────────────
function ExplorationTab() {
  const [segIdx, setSegIdx] = useState(0);
  const seg = SEGMENTS[segIdx];
  const data = useMemo(() => simulateThompsonSampling(seg, 100), [segIdx]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {SEGMENTS.slice(0, 4).map((s, i) => <button key={s.id} onClick={() => setSegIdx(i)} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: segIdx === i ? "2px solid #1d4ed8" : "1px solid #d1d5db", background: segIdx === i ? "#eff6ff" : "#fff", cursor: "pointer", fontWeight: segIdx === i ? 600 : 400, color: segIdx === i ? "#1d4ed8" : "#374151" }}>{s.name.split(' ').slice(0, 2).join(' ')}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Best Model" value={data.arms.sort((a, b) => b.posteriorMean - a.posteriorMean)[0]?.name.split(' ')[0]} highlight />
        <MetricCard label="Total Regret" value={data.totalRegret.toFixed(1)} subtext={`${data.regretPct}% of optimal`} trend="down" />
        <MetricCard label="Final Exploration" value={`${(data.dayResults[data.dayResults.length - 1]?.explorationRate * 100).toFixed(0)}%`} subtext="Converges toward 0%" />
        <MetricCard label="Trials" value="100" subtext="Model routing decisions" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Cumulative Regret Over Time" description="Regret growth rate slows as the bandit learns — sublinear regret is optimal">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.dayResults}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Area type="monotone" dataKey="regret" stroke="#dc2626" fill="#dc2626" fillOpacity={0.1} strokeWidth={2} name="Cumulative Regret" /><Line type="monotone" dataKey="explorationRate" stroke="#2563eb" strokeWidth={2} dot={false} name="Exploration Rate" /></ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Model Selection Distribution" description="Thompson Sampling concentrates selections on the best model over time">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.arms.sort((a, b) => b.posteriorMean - a.posteriorMean)}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="selectionPct" fill="#2563eb" radius={[4,4,0,0]} name="Selection %" /><Bar dataKey="trueRate" fill="#16a34a" radius={[4,4,0,0]} name="True Success Rate" /></BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
      <SectionCard title="Model Performance Summary">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>{["Model","Successes","Failures","Posterior Mean","True Rate","Selection %","Status"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#6b7280", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>{data.arms.sort((a, b) => b.posteriorMean - a.posteriorMean).map((a, i) => <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i === 0 ? "#f0fdf4" : "transparent" }}><td style={{ padding: "6px 10px", fontWeight: 500 }}>{a.name}</td><td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#16a34a" }}>{a.successes}</td><td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#dc2626" }}>{a.failures}</td><td style={{ padding: "6px 10px", fontFamily: "monospace", fontWeight: 600 }}>{a.posteriorMean.toFixed(4)}</td><td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{a.trueRate.toFixed(2)}</td><td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{a.selectionPct}%</td><td style={{ padding: "6px 10px" }}><span style={{ background: i === 0 ? "#f0fdf4" : "#f9fafb", color: i === 0 ? "#16a34a" : "#6b7280", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{i === 0 ? "EXPLOIT" : "EXPLORE"}</span></td></tr>)}</tbody>
        </table>
      </SectionCard>
      <InsightBox type="success" title="Key Insight: Exploration-Exploitation" content={`Thompson Sampling achieves ${data.regretPct}% regret — meaning only ${data.regretPct}% of decisions were suboptimal. The exploration rate is NOT a hyperparameter; it emerges naturally from posterior uncertainty. Early: wide posteriors → diverse selection. Later: narrow posteriors → consistent exploitation. This is provably near-optimal (matches the Lai-Robbins lower bound up to constants).`} />
    </div>
  );
}

// ─── Tab: Cascade Ranking ────────────────────────────────────────────
function CascadeRankingTab({ advertisers }) {
  const [segIdx, setSegIdx] = useState(0);
  const seg = SEGMENTS[segIdx];
  const data = useMemo(() => simulateCascade(advertisers, seg), [advertisers, segIdx]);

  const comparisonData = [
    { metric: "Revenue ($)", cascade: data.cascade.revenue, single: data.singleStage.revenue },
    { metric: "Compute (units)", cascade: data.cascade.compute, single: data.singleStage.compute },
    { metric: "Rev/Compute", cascade: data.revPerCompute.cascade, single: data.revPerCompute.single },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {SEGMENTS.slice(0, 4).map((s, i) => <button key={s.id} onClick={() => setSegIdx(i)} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: segIdx === i ? "2px solid #1d4ed8" : "1px solid #d1d5db", background: segIdx === i ? "#eff6ff" : "#fff", cursor: "pointer", fontWeight: segIdx === i ? 600 : 400, color: segIdx === i ? "#1d4ed8" : "#374151" }}>{s.name.split(' ').slice(0, 2).join(' ')}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Compute Savings" value={`${data.savings}%`} subtext="vs single-stage" trend="up" highlight />
        <MetricCard label="Revenue Impact" value={`${data.revDiff > 0 ? '+' : ''}${data.revDiff}%`} subtext="vs single-stage" trend={data.revDiff >= 0 ? "up" : "down"} />
        <MetricCard label="Rev/Compute" value={`${data.revPerCompute.cascade}`} subtext={`Single: ${data.revPerCompute.single}`} trend="up" />
        <MetricCard label="Total Latency" value={`${data.stages.reduce((s, st) => s + parseInt(st.latency), 0)}ms`} subtext="Stage 1 + 2 + 3" />
      </div>
      <SectionCard title="Cascade Pipeline Stages" description="Each stage reduces candidates while increasing scoring quality">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, overflowX: "auto" }}>
          {data.stages.map((stage, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ background: i === 0 ? "#eff6ff" : i === 1 ? "#fef3c7" : "#f0fdf4", border: `1px solid ${i === 0 ? "#93c5fd" : i === 1 ? "#fcd34d" : "#86efac"}`, borderRadius: 8, padding: "12px 16px", minWidth: 180, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{stage.name}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{stage.model}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "4px 0" }}>{stage.input} → {stage.output}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>Compute: {stage.compute} | {stage.latency}</div>
              </div>
              {i < data.stages.length - 1 && <div style={{ fontSize: 18, color: "#9ca3af" }}>→</div>}
            </div>
          ))}
          <div style={{ fontSize: 18, color: "#9ca3af" }}>→</div>
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", minWidth: 120, textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Auction</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>VCG</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "4px 0" }}>{data.cascade.winners} winners</div>
            <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>${data.cascade.revenue.toFixed(0)}</div>
          </div>
        </div>
      </SectionCard>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Cascade vs Single-Stage Comparison">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparisonData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="metric" tick={{ fontSize: 11 }} width={100} /><Tooltip /><Legend /><Bar dataKey="cascade" fill="#2563eb" name="Cascade" radius={[0,4,4,0]} /><Bar dataKey="single" fill="#9333ea" name="Single-Stage" radius={[0,4,4,0]} /></BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Compute-Quality Tradeoff">
          <div style={{ padding: "20px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>Cascade</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb" }}>{data.cascade.compute}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>compute units</div>
              </div>
              <div style={{ textAlign: "center", alignSelf: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#16a34a" }}>{data.savings}%</div>
                <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>savings</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>Single-Stage</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#9333ea" }}>{data.singleStage.compute}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>compute units</div>
              </div>
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 8, height: 24, overflow: "hidden", marginTop: 8 }}>
              <div style={{ background: "linear-gradient(90deg, #2563eb, #60a5fa)", height: "100%", width: `${(data.cascade.compute / data.singleStage.compute) * 100}%`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>Cascade</span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
      {/* Latency-to-Conversion Impact */}
      <SectionCard title="Latency-to-Conversion Impact" description="Ad serving latency doesn't just cost compute — it costs conversions. ~1% site conversion drop per 100ms of additional latency.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 12 }}>
          <div style={{ background: "#eff6ff", borderRadius: 8, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Cascade Latency</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb" }}>{data.latency.cascadeMs}ms</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Conv. loss: {data.latency.cascadeConvLossPct}%</div>
          </div>
          <div style={{ background: "#f5f3ff", borderRadius: 8, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Single-Stage Latency</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#9333ea" }}>{data.latency.singleMs}ms</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Conv. loss: {data.latency.singleConvLossPct}%</div>
          </div>
          <div style={{ background: data.latency.netAdvantage > 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 8, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Net Revenue (latency-adjusted)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: data.latency.netAdvantage > 0 ? "#16a34a" : "#dc2626" }}>
              {data.latency.netAdvantage > 0 ? '+' : ''}${data.latency.netAdvantage.toFixed(0)}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Cascade {data.latency.netAdvantage > 0 ? 'advantage' : 'disadvantage'}</div>
            {data.latency.latencyChangesWinner && <div style={{ fontSize: 9, fontWeight: 600, color: "#16a34a", marginTop: 4 }}>Latency flips the winner!</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1, background: "#f8fafc", borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Cascade Net: ${data.latency.cascadeNetRev.toFixed(0)}</div>
            <div style={{ background: "#e5e7eb", borderRadius: 4, height: 16, overflow: "hidden" }}>
              <div style={{ background: "#2563eb", height: "100%", width: `${Math.min(100, (data.latency.cascadeNetRev / Math.max(data.latency.cascadeNetRev, data.latency.singleNetRev)) * 100)}%`, borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ flex: 1, background: "#f8fafc", borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Single Net: ${data.latency.singleNetRev.toFixed(0)}</div>
            <div style={{ background: "#e5e7eb", borderRadius: 4, height: 16, overflow: "hidden" }}>
              <div style={{ background: "#9333ea", height: "100%", width: `${Math.min(100, (data.latency.singleNetRev / Math.max(data.latency.cascadeNetRev, data.latency.singleNetRev)) * 100)}%`, borderRadius: 4 }} />
            </div>
          </div>
        </div>
      </SectionCard>
      <InsightBox type="warning" title="Key Insight: The True Cost Is Latency, Not Just Compute" content={`The cascade saves ${data.savings}% compute, but the real advantage is latency: ${data.latency.cascadeMs}ms vs ${data.latency.singleMs}ms. At ~1% conversion loss per 100ms, single-stage loses ${data.latency.singleConvLossPct}% of site conversions vs cascade's ${data.latency.cascadeConvLossPct}%. After latency adjustment, cascade ${data.latency.netAdvantage > 0 ? 'gains' : 'loses'} $${Math.abs(data.latency.netAdvantage).toFixed(0)} net revenue. In production, latency budgets (not compute budgets) often determine cascade depth — a 100ms delay in ad rendering can cause a 1% total site conversion drop that outweighs revenue gains from running more complex models.`} />
    </div>
  );
}

// ─── Tab: Ecosystem Impact ───────────────────────────────────────────
function EcosystemImpactTab({ advertisers }) {
  const pacingData = useMemo(() =>
    SEGMENTS.slice(0, 4).map(seg => {
      const hourly = simulatePacing(advertisers, seg);
      const morning = hourly.filter(h => h.hour < 12).reduce((s, h) => s + h.revenue, 0);
      const evening = hourly.filter(h => h.hour >= 12).reduce((s, h) => s + h.revenue, 0);
      return { segment: seg.name.split(' ').slice(0, 2).join(' '), morning: +morning.toFixed(0), evening: +evening.toFixed(0), ratio: +(evening / Math.max(morning, 1)).toFixed(2) };
    }), [advertisers]);

  const cascadeData = useMemo(() =>
    SEGMENTS.slice(0, 4).map(seg => {
      const c = simulateCascade(advertisers, seg);
      return { segment: seg.name.split(' ').slice(0, 2).join(' '), computeSavings: c.savings, revImpact: c.revDiff, revPerCompute: c.revPerCompute.cascade };
    }), [advertisers]);

  const feedbackData = useMemo(() => {
    const d = simulateQualityFeedback(advertisers, SEGMENTS[0], 10);
    return d.trajectory;
  }, [advertisers]);

  const banditData = useMemo(() => simulateThompsonSampling(SEGMENTS[0], 50), []);

  const interactionMatrix = [
    { feature: "Pacing × Quality", impact: "High", direction: "Reinforcing", description: "Fast spenders lose impressions → quality decays faster" },
    { feature: "Pacing × Exploration", impact: "Medium", direction: "Conflicting", description: "Budget-constrained segments under-explore expensive models" },
    { feature: "Quality × Cascade", impact: "High", direction: "Reinforcing", description: "Quality floor in re-ranking stage amplifies feedback loop" },
    { feature: "Exploration × Cascade", impact: "Medium", direction: "Dependent", description: "Exploration is cheap at retrieval, expensive at ranking" },
  ];

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)", borderRadius: 12, padding: "24px 28px", marginBottom: 24, color: "#fff" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Ecosystem Impact Analysis</h2>
        <p style={{ fontSize: 13, opacity: 0.9, margin: 0, lineHeight: 1.5 }}>
          How budget pacing, quality feedback, exploration-exploitation, and cascade ranking interact to determine system equilibrium and revenue. This synthesis is what separates component-level engineering from systems-level strategy.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Pacing Impact by Segment" description="Evening/morning revenue ratio shows temporal scarcity effects">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pacingData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="segment" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Bar dataKey="morning" fill="#60a5fa" name="Morning Revenue" radius={[4,4,0,0]} /><Bar dataKey="evening" fill="#1d4ed8" name="Evening Revenue" radius={[4,4,0,0]} /></BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Cascade Efficiency by Segment" description="Compute savings vs revenue impact tradeoff">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cascadeData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="segment" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Bar dataKey="computeSavings" fill="#16a34a" name="Compute Savings %" radius={[4,4,0,0]} /><Bar dataKey="revImpact" fill="#dc2626" name="Revenue Impact %" radius={[4,4,0,0]} /></BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Quality Divergence Over Rounds" description="Feedback loop creates natural selection in advertiser population">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={feedbackData}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="round" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="qualityStd" stroke="#dc2626" strokeWidth={2} name="Quality Std Dev" /><Bar dataKey="highQuality" fill="#16a34a" name="High Quality Count" opacity={0.7} /></ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Bandit Learning Curve" description="Exploration rate naturally decreases as posterior narrows">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={banditData.dayResults.filter((_, i) => i % 2 === 0)}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Area type="monotone" dataKey="regret" stroke="#dc2626" fill="#dc2626" fillOpacity={0.1} name="Cumulative Regret" /><Line type="monotone" dataKey="explorationRate" stroke="#2563eb" strokeWidth={2} dot={false} name="Exploration Rate" /></ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Mechanism Interaction Matrix" description="How the four improvements interact — understanding these interactions is the systems-level differentiator">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>{["Interaction","Impact","Direction","Description"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#6b7280", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>{interactionMatrix.map((row, i) => <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
            <td style={{ padding: "8px 10px", fontWeight: 600 }}>{row.feature}</td>
            <td style={{ padding: "8px 10px" }}><span style={{ background: row.impact === "High" ? "#fef2f2" : "#fffbeb", color: row.impact === "High" ? "#dc2626" : "#ca8a04", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{row.impact}</span></td>
            <td style={{ padding: "8px 10px" }}><span style={{ background: row.direction === "Reinforcing" ? "#f0fdf4" : row.direction === "Conflicting" ? "#fef2f2" : "#eff6ff", color: row.direction === "Reinforcing" ? "#16a34a" : row.direction === "Conflicting" ? "#dc2626" : "#1d4ed8", padding: "2px 8px", borderRadius: 4, fontSize: 10 }}>{row.direction}</span></td>
            <td style={{ padding: "8px 10px", color: "#6b7280" }}>{row.description}</td>
          </tr>)}</tbody>
        </table>
      </SectionCard>

      <InsightBox type="success" title="The Systems-Level Synthesis" content="These four mechanisms — pacing, feedback, exploration, and cascading — interact in non-obvious ways to determine equilibrium pricing and revenue. Budget pacing creates temporal scarcity that amplifies quality feedback loops. Cascade ranking constrains the exploration space, making bandit routing cheaper at early stages but limiting discovery at later stages. Understanding these interactions and their equilibrium properties is what defines advanced monetization thinking." />
    </div>
  );
}

// ─── Tab: Segment Explorer (original) ────────────────────────────────
function SegmentExplorer() {
  const [selected, setSelected] = useState(SEGMENTS[0].id);
  const seg = SEGMENTS.find(s => s.id === selected);
  const rec = useMemo(() => getModelRecommendation(seg), [selected]);
  const radarData = rec.results.map(r => ({ model: r.modelName.split(' ')[0], ctrLift: +(r.ctrLift * 100).toFixed(0), revLift: +(r.revenueLift * 100).toFixed(0), speed: +(100 - r.latencyCost).toFixed(0) }));
  const allSegRecs = useMemo(() => SEGMENTS.map(s => { const r = getModelRecommendation(s); const best = r.results.find(x => x.model === r.recommended); return { segment: s.name.split(' ').slice(0, 2).join(' '), model: best.modelName, revLift: best.revenueLift, ctrLift: best.ctrLift, latency: best.latencyCost, reason: r.reason }; }), []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {SEGMENTS.map(s => <button key={s.id} onClick={() => setSelected(s.id)} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: selected === s.id ? "2px solid #1d4ed8" : "1px solid #d1d5db", background: selected === s.id ? "#eff6ff" : "#fff", color: selected === s.id ? "#1d4ed8" : "#374151", cursor: "pointer", fontWeight: selected === s.id ? 600 : 400 }}>{s.name}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Segment Size" value={seg.size.toLocaleString()} />
        <MetricCard label="Avg CTR" value={`${(seg.avgCTR * 100).toFixed(1)}%`} />
        <MetricCard label="Avg CVR" value={`${(seg.avgCVR * 100).toFixed(1)}%`} />
        <MetricCard label="Best Model" value={rec.results.find(r => r.model === rec.recommended)?.modelName.split(' ')[0]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SectionCard title="Model Performance Comparison">
          <ResponsiveContainer width="100%" height={260}><BarChart data={rec.results}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="modelName" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="ctrLift" name="CTR Lift" fill="#2563eb" radius={[4,4,0,0]} /><Bar dataKey="revenueLift" name="Revenue Lift" fill="#16a34a" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>
        </SectionCard>
        <SectionCard title={`Model Radar: ${seg.name}`}>
          <ResponsiveContainer width="100%" height={260}><RadarChart data={radarData}><PolarGrid stroke="#e5e7eb" /><PolarAngleAxis dataKey="model" tick={{ fontSize: 10 }} /><PolarRadiusAxis tick={{ fontSize: 9 }} /><Radar name="CTR" dataKey="ctrLift" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} /><Radar name="Rev" dataKey="revLift" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} /><Radar name="Speed" dataKey="speed" stroke="#ea580c" fill="#ea580c" fillOpacity={0.1} /><Legend /></RadarChart></ResponsiveContainer>
        </SectionCard>
      </div>
      <SectionCard title="Segment → Model Routing Table">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>{["Segment","Model","Rev Lift","CTR Lift","Latency","Reason"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#6b7280", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>{allSegRecs.map((r, i) => <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: SEGMENTS[i].id === selected ? "#eff6ff" : "transparent" }}><td style={{ padding: "8px 10px", fontWeight: 500 }}>{r.segment}</td><td style={{ padding: "8px 10px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{r.model}</span></td><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{r.revLift.toFixed(3)}</td><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{r.ctrLift.toFixed(3)}</td><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{r.latency}ms</td><td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{r.reason}</td></tr>)}</tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ─── Tab: What-If Chat (original, enhanced) ──────────────────────────
function WhatIfChat({ advertisers }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: `Welcome to the **Ad Auction What-If Analyzer** (v2.0).\n\nI can simulate and analyze:\n- **Budget Pacing**: "Show me how budget depletion affects reserves"\n- **Quality Feedback**: "What happens to quality scores over 10 rounds?"\n- **Exploration vs Exploitation**: "How much regret from model exploration?"\n- **Cascade vs Single-Stage**: "Compare cascade ranking efficiency"\n- **Reserve Prices**: "What if reserve price is $2.50?"\n- **VCG vs GSP**: "Compare auction mechanisms"\n\nIn the full version, this is powered by Claude API with tool-use.` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

  const processQuery = useCallback((query) => {
    const q = query.toLowerCase();
    const baseline = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "VCG" });

    if (q.includes("pacing") || q.includes("budget") || q.includes("deplet")) {
      const hourly = simulatePacing(advertisers, SEGMENTS[0]);
      const totalRev = hourly.reduce((s, h) => s + h.revenue, 0);
      const peak = hourly.reduce((b, h) => h.revenue > b.revenue ? h : b);
      return `## Budget Pacing Analysis\n\n**24-hour revenue:** $${totalRev.toFixed(0)} for ${SEGMENTS[0].name}\n**Peak hour:** ${peak.time} ($${peak.revenue.toFixed(0)})\n**Reserve price range:** $${Math.min(...hourly.map(h => h.reserve)).toFixed(2)} — $${Math.max(...hourly.map(h => h.reserve)).toFixed(2)}\n\n**Key finding:** Reserve prices vary ${(Math.max(...hourly.map(h => h.reserve)) / Math.min(...hourly.map(h => h.reserve))).toFixed(1)}x through the day due to budget depletion creating scarcity. This temporal dynamic is a critical revenue lever — large platforms set time-of-day reserves using ML models that predict optimal floors.\n\n**Staff insight:** The pacing equilibrium depends on advertiser budget distributions. Heavy-tailed budgets create "whale" effects where a few advertisers dominate evening auctions.`;
    }
    if (q.includes("quality") || q.includes("feedback") || q.includes("diverge") || q.includes("death spiral")) {
      const data = simulateQualityFeedback(advertisers, SEGMENTS[0], 10);
      const last = data.trajectory[data.trajectory.length - 1];
      return `## Quality Score Feedback Analysis\n\n**After 10 rounds:** Quality std dev = ${last.qualityStd}\n**High quality (>0.7):** ${last.highQuality} advertisers\n**Low quality (<0.3):** ${last.lowQuality} advertisers\n\n**Divergence pattern:** Quality scores diverge as high-quality ads win more → generate data → improve predictions. Low-quality ads enter a "death spiral" — losing impressions → sparse data → stale predictions → lower quality.\n\n**Staff insight:** This feedback loop determines advertiser lifecycle. Platforms must monitor new advertiser quality curves and provide "warm-up" periods (exploration budget) to avoid premature death spirals for potentially good advertisers.`;
    }
    if (q.includes("exploration") || q.includes("exploit") || q.includes("bandit") || q.includes("thompson") || q.includes("regret")) {
      const data = simulateThompsonSampling(SEGMENTS[0], 100);
      return `## Exploration-Exploitation Analysis\n\n**Best model identified:** ${data.arms.sort((a, b) => b.posteriorMean - a.posteriorMean)[0].name}\n**Total regret:** ${data.totalRegret} (${data.regretPct}% of optimal)\n**Final exploration rate:** ${(data.dayResults[data.dayResults.length - 1].explorationRate * 100).toFixed(0)}%\n\n**Thompson Sampling behavior:** Starts with ~50% exploration (uniform), converges to <10% as posteriors narrow. Regret grows sublinearly — matching the Lai-Robbins lower bound.\n\n**Staff insight:** In production, the cost of exploration is real revenue. An 8% exploration rate on 1B daily impressions = 80M suboptimal impressions. But the information value justifies it: discovering a model that lifts CTR by 2% across 920M exploit impressions far exceeds the exploration cost.`;
    }
    if (q.includes("cascade") || q.includes("stage") || q.includes("retrieval") || q.includes("ranking") || q.includes("compute")) {
      const data = simulateCascade(advertisers, SEGMENTS[0]);
      return `## Cascade Ranking Analysis\n\n**Compute savings:** ${data.savings}% vs single-stage\n**Revenue impact:** ${data.revDiff > 0 ? '+' : ''}${data.revDiff}%\n**Revenue per compute:** Cascade ${data.revPerCompute.cascade} vs Single ${data.revPerCompute.single}\n\n**Pipeline:** ${data.stages.map(s => `${s.name} (${s.input}→${s.output})`).join(' → ')} → Auction\n\n**Staff insight:** The optimal cascade width varies by segment. High-value segments (luxury shoppers) justify wider funnels (more candidates through expensive stages) because marginal revenue per compute is higher. Low-value segments should use narrower funnels.`;
    }
    if (q.includes("reserve") || q.includes("floor price")) {
      const match = query.match(/\$?([\d.]+)/);
      const rp = match ? parseFloat(match[1]) : 2.0;
      const scenario = runWhatIf(advertisers, { reservePrice: rp, slots: 5, mechanism: "VCG" });
      const delta = scenario.totalRevenue - baseline.totalRevenue;
      const pct = ((delta / baseline.totalRevenue) * 100).toFixed(1);
      return `## Reserve Price Analysis\n\nChanging from $0.50 → $${rp}:\n\n**Revenue:** $${baseline.totalRevenue.toLocaleString()} → $${scenario.totalRevenue.toLocaleString()} (${delta > 0 ? '+' : ''}${pct}%)\n\n${delta > 0 ? 'Higher reserves filter low-quality bids. Watch for fill rate drops in thin segments.' : 'Lower reserves increase fill but reduce CPCs. Consider segment-specific reserves.'}\n\n**Key insight:** Reserve prices are set per-auction using ML models. The revenue-optimal reserve ≠ welfare-optimal reserve — this tension is central to monetization strategy.`;
    }
    if (q.includes("gsp") || q.includes("vcg") || q.includes("mechanism") || q.includes("compare")) {
      const gsp = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "GSP" });
      const vcg = runWhatIf(advertisers, { reservePrice: 0.5, slots: 5, mechanism: "VCG" });
      const delta = ((vcg.totalRevenue - gsp.totalRevenue) / gsp.totalRevenue * 100).toFixed(1);
      return `## VCG vs GSP Comparison\n\n| Metric | VCG | GSP |\n|--------|-----|-----|\n| Revenue | $${vcg.totalRevenue.toLocaleString()} | $${gsp.totalRevenue.toLocaleString()} |\n| RPM | $${vcg.avgRPM} | $${gsp.avgRPM} |\n\n**Revenue delta:** ${delta}% with VCG\n\n**Why VCG is the production choice for feed-based platforms:**\n- Truthful bidding is a dominant strategy → eliminates adversarial bid shading complexity\n- Externality pricing ensures ads only win when their value exceeds the opportunity cost of displacing organic content\n- Welfare maximization aligns platform incentives with user experience and long-term marketplace health\n- Simplifies the advertiser ecosystem: no strategic behavior modeling required\n\n**Key insight:** The ~6-7% revenue gap vs GSP is the cost of a healthier marketplace. GSP's extra revenue comes from non-truthful dynamics that create adversarial complexity, degrade user experience in feed contexts, and require expensive bid optimization infrastructure. VCG's welfare-maximizing property is the right foundation for platforms optimizing time-on-platform rather than per-auction revenue.`;
    }
    return `I can help analyze auction dynamics in depth. Try:\n\n1. **"Show budget pacing effects"** — temporal scarcity dynamics\n2. **"Quality feedback over 10 rounds"** — advertiser selection\n3. **"How much exploration regret?"** — bandit tradeoffs\n4. **"Cascade vs single-stage efficiency"** — compute optimization\n5. **"Reserve price $2.50"** — pricing analysis\n6. **"Compare VCG vs GSP"** — mechanism design`;
  }, [advertisers]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput(""); setLoading(true);
    setTimeout(() => { setMessages(prev => [...prev, { role: "assistant", content: processQuery(userMsg) }]); setLoading(false); }, 600);
  };

  const renderMarkdown = (text) => text.replace(/## (.*)/g, '<h3 style="font-size:15px;font-weight:700;color:#111827;margin:12px 0 8px">$1</h3>').replace(/### (.*)/g, '<h4 style="font-size:13px;font-weight:600;color:#374151;margin:10px 0 6px">$1</h4>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br/><br/>').replace(/\n- (.*)/g, '<br/>• $1').replace(/\|(.+)\|/g, (match) => { const cells = match.split('|').filter(c => c.trim()); if (cells.every(c => c.trim().match(/^[-]+$/))) return ''; return '<div style="display:flex;gap:16px;font-size:12px;font-family:monospace;padding:2px 0">' + cells.map(c => `<span style="min-width:80px">${c.trim()}</span>`).join('') + '</div>'; });

  const suggestions = ["Show budget pacing effects", "Quality feedback analysis", "How much exploration regret?", "Cascade vs single-stage", "Reserve price $2.50", "Compare VCG vs GSP"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600 }}>
      <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: m.role === "user" ? "70%" : "90%", background: m.role === "user" ? "#1d4ed8" : "#f9fafb", color: m.role === "user" ? "#fff" : "#111827", border: m.role === "user" ? "none" : "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.6 }}>{m.role === "assistant" ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} /> : m.content}</div>)}
        {loading && <div style={{ alignSelf: "flex-start", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", fontSize: 13 }}><span style={{ animation: "pulse 1.5s infinite" }}>Analyzing...</span></div>}
      </div>
      {messages.length <= 1 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 0" }}>{suggestions.map(s => <button key={s} onClick={() => setInput(s)} style={{ padding: "6px 12px", fontSize: 11, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer" }}>{s}</button>)}</div>}
      <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="Ask about pacing, quality feedback, exploration, cascade ranking..." style={{ flex: 1, padding: "10px 14px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, outline: "none" }} />
        <button onClick={handleSend} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Send</button>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────
// ─── Tab: Finance Scenario ────────────────────────────────────────────
const FINANCE_SUB_VERTICALS = {
  credit_cards: { name: "Credit Cards", avgCPA: 85, trustSensitivity: 0.8, regRisk: 0.6, window: 14 },
  personal_loans: { name: "Personal Loans", avgCPA: 120, trustSensitivity: 0.9, regRisk: 0.8, window: 21 },
  insurance: { name: "Insurance", avgCPA: 65, trustSensitivity: 0.85, regRisk: 0.7, window: 30 },
  investment: { name: "Investment Platforms", avgCPA: 150, trustSensitivity: 0.95, regRisk: 0.9, window: 7 },
  neobanks: { name: "Neobanks / Fintech", avgCPA: 45, trustSensitivity: 0.6, regRisk: 0.4, window: 3 },
};

const FINANCE_ALGOS = [
  { id: "two_tower", name: "Two-Tower Retrieval", precision: 0.72, coldStart: 0.65, coverage: 0.95, latency: 5, compute: 0.1, trust: 0.4, risk: 0.3, color: "#60a5fa" },
  { id: "gbdt", name: "GBDT Ranker", precision: 0.88, coldStart: 0.45, coverage: 0.78, latency: 12, compute: 0.3, trust: 0.7, risk: 0.65, color: "#16a34a" },
  { id: "dlrm", name: "DLRM Deep Model", precision: 0.92, coldStart: 0.38, coverage: 0.85, latency: 25, compute: 1.0, trust: 0.75, risk: 0.6, color: "#9333ea" },
  { id: "bandit", name: "Contextual Bandit", precision: 0.68, coldStart: 0.82, coverage: 0.82, latency: 8, compute: 0.2, trust: 0.5, risk: 0.4, color: "#ea580c" },
  { id: "hybrid_ensemble", name: "Hybrid Ensemble", precision: 0.94, coldStart: 0.58, coverage: 0.88, latency: 30, compute: 1.4, trust: 0.78, risk: 0.7, color: "#2563eb" },
  { id: "risk_adjusted", name: "Risk-Adjusted Ranker", precision: 0.90, coldStart: 0.42, coverage: 0.83, latency: 28, compute: 1.2, trust: 0.9, risk: 0.95, color: "#dc2626" },
];

function simulateFinanceScenario(segment, subVertical, days = 30) {
  const sv = FINANCE_SUB_VERTICALS[subVertical];
  const dataDensity = Math.min(1.0, segment.size / 4000000);
  const warmth = dataDensity * (sv.regRisk < 0.5 ? 0.9 : 0.7); // Proxy for data richness

  return FINANCE_ALGOS.map(algo => {
    const rng = seededRandom(42 + algo.id.length * 13 + subVertical.length * 7);
    const baseCTR = segment.avgCTR * algo.precision * (warmth > 0.4 ? 1.1 : algo.coldStart);
    const trustFactor = 0.6 + 0.4 * algo.trust * sv.trustSensitivity;
    const windowFactor = Math.min(1, 7 / sv.window);
    const baseCVR = segment.avgCVR * algo.precision * windowFactor;

    let trust = 0.7, advSat = 0.5, totalRev = 0, totalConv = 0, totalRisk = 0;
    const daily = [];

    for (let d = 0; d < days; d++) {
      let learn = 1 + 0.3 * (1 - Math.exp(-d / 10));
      if (algo.id === "bandit") learn *= 1.15;
      else if (algo.id === "dlrm") learn *= 1 + 0.1 * Math.min(1, d / 15);
      else if (algo.id === "hybrid_ensemble") learn *= 1.1;

      const noise = 1 + (rng() - 0.5) * 0.15;
      const ctr = Math.max(0.002, Math.min(0.12, baseCTR * trustFactor * learn * noise * (0.95 + 0.05 * trust)));
      const cvr = Math.max(0.001, Math.min(0.08, baseCVR * learn * (1 + (rng() - 0.5) * 0.2)));
      const clicks = Math.floor(10000 * ctr);
      const conversions = Math.floor(clicks * cvr);
      const revenue = conversions * sv.avgCPA;
      const riskBase = Math.max(0, (1 - algo.risk) * sv.regRisk);
      const riskInc = Math.floor(clicks * riskBase * 0.02 * (rng() + 0.5));
      trust = Math.max(0.1, Math.min(1, trust + 0.005 * (cvr / Math.max(baseCVR, 0.001)) - 0.02 * riskInc / Math.max(clicks, 1)));
      const cpRatio = revenue / Math.max(conversions, 1) / sv.avgCPA;
      advSat = Math.max(0.1, Math.min(1, advSat + (cpRatio > 0.8 ? 0.02 * (cpRatio - 0.8) : -0.03)));
      totalRev += revenue; totalConv += conversions; totalRisk += riskInc;
      daily.push({ day: d + 1, ctr: +ctr.toFixed(5), cvr: +cvr.toFixed(5), revenue: +revenue.toFixed(0), trust: +trust.toFixed(4), advSat: +advSat.toFixed(4), riskInc, conversions });
    }

    return {
      ...algo, daily, totalRevenue: +totalRev.toFixed(0), totalConversions: totalConv,
      avgCTR: +(daily.reduce((s, d) => s + d.ctr, 0) / days).toFixed(5),
      avgCVR: +(daily.reduce((s, d) => s + d.cvr, 0) / days).toFixed(5),
      avgCPA: +(totalRev / Math.max(totalConv, 1)).toFixed(0),
      finalTrust: daily[daily.length - 1]?.trust || 0.5,
      finalAdvSat: daily[daily.length - 1]?.advSat || 0.5,
      totalRisk, computeCost30d: +(algo.compute * 10000 * days / 1000).toFixed(1),
    };
  });
}

function scoreAndRankAlgorithms(results) {
  const maxRev = Math.max(...results.map(r => r.totalRevenue)) || 1;
  const maxRisk = Math.max(...results.map(r => r.totalRisk)) || 1;
  const maxEfficiency = Math.max(...results.map(r => r.totalRevenue / Math.max(r.computeCost30d, 0.1))) || 1;

  return results.map(r => {
    const revScore = r.totalRevenue / maxRev;
    const riskScore = 1 - r.totalRisk / maxRisk;
    const qualityScore = r.finalTrust * 0.5 + riskScore * 0.5;
    const effScore = (r.totalRevenue / Math.max(r.computeCost30d, 0.1)) / maxEfficiency;
    const overall = revScore * 0.30 + qualityScore * 0.35 + effScore * 0.15 + r.finalAdvSat * 0.20;
    return { ...r, revScore: +revScore.toFixed(4), qualityScore: +qualityScore.toFixed(4), effScore: +effScore.toFixed(4), overall: +overall.toFixed(4) };
  }).sort((a, b) => b.overall - a.overall);
}

function FinanceScenarioTab() {
  const [subVertical, setSubVertical] = useState("credit_cards");
  const [segIdx, setSegIdx] = useState(4); // biz_professionals
  const seg = SEGMENTS[segIdx];

  const ranked = useMemo(() => {
    const raw = simulateFinanceScenario(seg, subVertical);
    return scoreAndRankAlgorithms(raw);
  }, [segIdx, subVertical]);

  const winner = ranked[0];
  const runnerUp = ranked[1];
  const sv = FINANCE_SUB_VERTICALS[subVertical];

  // Learning curves for chart
  const revenueCurveData = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      const point = { day: i + 1 };
      ranked.forEach(r => { point[r.name.split(" ")[0]] = r.daily[i]?.revenue || 0; });
      return point;
    }),
    [ranked]
  );

  const trustCurveData = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      const point = { day: i + 1 };
      ranked.forEach(r => { point[r.name.split(" ")[0]] = +(r.daily[i]?.trust * 100).toFixed(1) || 50; });
      return point;
    }),
    [ranked]
  );

  const radarData = useMemo(() =>
    ranked.slice(0, 4).map(r => ({
      name: r.name.replace(" Retrieval", "").replace(" Ranker", "").replace(" Deep Model", "").replace("Contextual ", ""),
      Revenue: +(r.revScore * 100).toFixed(0),
      Quality: +(r.qualityScore * 100).toFixed(0),
      Efficiency: +(r.effScore * 100).toFixed(0),
      "Adv. Sat": +(r.finalAdvSat * 100).toFixed(0),
    })),
    [ranked]
  );

  return (
    <div>
      {/* Scenario Header */}
      <SectionCard title={`Financial Services Scenario: ${sv.name}`} description="30-day simulation comparing 6 recommender algorithms optimized for financial services constraints: trust sensitivity, regulatory risk, long conversion windows, and high CPAs.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Sub-Vertical</label>
            <select value={subVertical} onChange={e => setSubVertical(e.target.value)} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}>
              {Object.entries(FINANCE_SUB_VERTICALS).map(([k, v]) => <option key={k} value={k}>{v.name} (CPA: ${v.avgCPA})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Segment</label>
            <select value={segIdx} onChange={e => setSegIdx(+e.target.value)} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}>
              {SEGMENTS.map((s, i) => <option key={s.id} value={i}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[
            { label: "Target CPA", value: `$${sv.avgCPA}` },
            { label: "Conv. Window", value: `${sv.window}d` },
            { label: "Trust Sensitivity", value: `${(sv.trustSensitivity * 100).toFixed(0)}%` },
            { label: "Regulatory Risk", value: `${(sv.regRisk * 100).toFixed(0)}%` },
            { label: "Algorithms Tested", value: "6" },
          ].map(m => (
            <div key={m.label} style={{ background: "#f8fafc", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase" }}>{m.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{m.value}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Winner Announcement */}
      <div style={{ background: "linear-gradient(135deg, #0a1a2f, #1d4ed8)", borderRadius: 10, padding: "20px 24px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "#93c5fd", textTransform: "uppercase", fontWeight: 600, letterSpacing: 1 }}>Recommended Algorithm</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "4px 0" }}>{winner.name}</div>
          <div style={{ fontSize: 12, color: "#bfdbfe" }}>
            Score: {(winner.overall * 100).toFixed(1)}% | Revenue: ${winner.totalRevenue.toLocaleString()} | {winner.totalConversions} conversions | Trust: {(winner.finalTrust * 100).toFixed(0)}%
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#60a5fa", fontFamily: "monospace" }}>#1</div>
          <div style={{ fontSize: 10, color: "#93c5fd" }}>of 6 algorithms tested</div>
        </div>
      </div>

      {/* Rankings Table */}
      <SectionCard title="Algorithm Rankings" description="Scored by: Revenue (30%), Quality (35%), Efficiency (15%), Advertiser Satisfaction (20%)">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              {["Rank", "Algorithm", "Overall", "Revenue", "Quality", "Efficiency", "30d Revenue", "Conversions", "CPA", "Trust", "Risk Inc.", "Latency"].map(h => (
                <th key={h} style={{ textAlign: h === "Algorithm" ? "left" : "right", padding: "6px 6px", color: "#6b7280", fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", background: i === 0 ? "#eff6ff" : i === 1 ? "#f8fafc" : "transparent" }}>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, color: i === 0 ? "#1d4ed8" : "#374151" }}>#{i + 1}</td>
                <td style={{ padding: "8px 6px", fontWeight: i === 0 ? 700 : 500 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: r.color, marginRight: 6 }} />
                  {r.name}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, color: i === 0 ? "#1d4ed8" : "#374151" }}>{(r.overall * 100).toFixed(1)}%</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{(r.revScore * 100).toFixed(1)}%</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{(r.qualityScore * 100).toFixed(1)}%</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{(r.effScore * 100).toFixed(1)}%</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace" }}>${r.totalRevenue.toLocaleString()}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace" }}>{r.totalConversions}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace" }}>${r.avgCPA}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{(r.finalTrust * 100).toFixed(0)}%</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: r.totalRisk > 50 ? "#dc2626" : "#16a34a" }}>{r.totalRisk}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{r.latency}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* Learning Curves + Radar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="30-Day Revenue Learning Curves" description="How each algorithm's revenue evolves as it learns from financial services data">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={revenueCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} label={{ value: "Day", position: "bottom", fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {ranked.slice(0, 4).map(r => (
                <Line key={r.id} type="monotone" dataKey={r.name.split(" ")[0]} stroke={r.color} strokeWidth={r.id === winner.id ? 3 : 1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Multi-Objective Comparison (Top 4)" description="Radar chart: Revenue, Quality (trust + risk), Efficiency (rev/compute), Advertiser Satisfaction">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="name" style={{ fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} style={{ fontSize: 9 }} />
              {["Revenue", "Quality", "Efficiency", "Adv. Sat"].map((key, i) => (
                <Radar key={key} name={key} dataKey={key} stroke={["#2563eb", "#16a34a", "#ea580c", "#9333ea"][i]} fill={["#2563eb", "#16a34a", "#ea580c", "#9333ea"][i]} fillOpacity={0.1} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Trust Evolution + Detailed Comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="User Trust Evolution" description="Trust builds with good matches and erodes with risk incidents — critical for financial services retention">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trustCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[40, 100]} label={{ value: "Trust %", angle: -90, position: "insideLeft", fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {ranked.slice(0, 4).map(r => (
                <Line key={r.id} type="monotone" dataKey={r.name.split(" ")[0]} stroke={r.color} strokeWidth={r.id === winner.id ? 3 : 1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Risk vs Revenue Tradeoff" description="Financial services require balancing revenue generation with regulatory risk">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="risk" name="Risk Incidents" tick={{ fontSize: 10 }} label={{ value: "Risk Incidents", position: "bottom", fontSize: 10 }} />
              <YAxis dataKey="revenue" name="Revenue ($)" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v, name) => name === "revenue" ? `$${v.toLocaleString()}` : v} />
              <Scatter data={ranked.map(r => ({ name: r.name, risk: r.totalRisk, revenue: r.totalRevenue, fill: r.color }))} fill="#2563eb">
                {ranked.map((r, i) => <Cell key={i} fill={r.color} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {ranked.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#374151" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: r.color }} />
                {r.name.split(" ").slice(0, 2).join(" ")}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Recommendation Box */}
      <InsightBox type="success" title={`Recommendation: ${winner.name}`} content={`${winner.name} achieves the highest overall score (${(winner.overall * 100).toFixed(1)}%) for ${sv.name} by balancing ${winner.qualityScore > winner.revScore ? "quality (trust + risk management) over raw revenue" : "strong revenue with acceptable risk levels"}. It generated $${winner.totalRevenue.toLocaleString()} over 30 days with ${winner.totalConversions} conversions at $${winner.avgCPA} CPA, maintaining ${(winner.finalTrust * 100).toFixed(0)}% user trust with only ${winner.totalRisk} risk incidents. ${winner.overall - runnerUp.overall < 0.03 ? `Close race with ${runnerUp.name} (gap: ${((winner.overall - runnerUp.overall) * 100).toFixed(1)}pp) — consider A/B testing both.` : `Clear advantage over runner-up ${runnerUp.name} (${((winner.overall - runnerUp.overall) * 100).toFixed(1)}pp lead).`}`} />
      <InsightBox type="warning" title="Key Insight: Finance Requires Trust-Weighted Optimization" content={`In financial services, the standard revenue-maximizing approach (which would pick ${ranked.sort((a, b) => b.totalRevenue - a.totalRevenue)[0].name}) isn't optimal. Quality scoring (35% weight) captures the reality that a bad financial ad recommendation erodes user trust (${sv.trustSensitivity * 100}% trust sensitivity), increases regulatory risk (${sv.regRisk * 100}% regulatory exposure), and ultimately destroys long-term LTV. The ${sv.window}-day conversion window means short-term CTR optimization misses the full picture — algorithms must balance immediate engagement with downstream conversion quality.`} />
    </div>
  );
}

// ─── Tab: Ads Ranking Model ────────────────────────────────────────────

const ADS_RANKING_VARIANTS = [
  { id: "full", name: "Full Model", color: "#2563eb", desc: "All features + multi-task + calibration" },
  { id: "no_calibration", name: "No Calibration", color: "#ea580c", desc: "Raw scores, no Platt scaling" },
  { id: "single_task", name: "Single-Task", color: "#16a34a", desc: "pCTR only, no auxiliary tasks" },
  { id: "no_cross_features", name: "No Cross-Features", color: "#7c3aed", desc: "Additive features only" },
  { id: "random", name: "Random Baseline", color: "#9ca3af", desc: "Random ranking reference" },
];

const FEATURE_NAMES_SHORT = {
  bid_competitiveness: "Bid Competitiveness",
  quality_score: "Quality Score",
  historical_ctr: "Historical CTR",
  segment_affinity: "Segment Affinity",
  "vertical×segment_cross": "Vertical×Segment",
  time_relevance: "Time Relevance",
  budget_utilization: "Budget Utilization",
  advertiser_tenure: "Advertiser Tenure",
  "vertical×hour_cross": "Vertical×Hour",
  ad_freshness: "Ad Freshness",
  "segment×hour_cross": "Segment×Hour",
  bid_to_reserve_ratio: "Bid/Reserve Ratio",
};

function simulateAdsRanking(advertisers, segment, hour, seed = 42) {
  const rng = seededRandom(seed + hour * 17);
  const eligible = advertisers.filter(a => a.segments.includes(segment.id)).slice(0, 50);
  if (eligible.length < 20) eligible.push(...advertisers.slice(0, 30));
  const candidates = eligible.slice(0, 50);
  const medianBid = [...candidates].sort((a, b) => a.bid - b.bid)[Math.floor(candidates.length / 2)]?.bid || 2;
  const hourMult = [0.30,0.20,0.15,0.12,0.10,0.18,0.40,0.65,0.82,0.90,0.88,0.85,0.78,0.75,0.80,0.85,0.90,0.95,1.0,0.98,0.92,0.80,0.60,0.42][hour % 24];

  function runVariant(variantId) {
    const predictions = candidates.map(a => {
      const r = seededRandom(seed + a.id.length * 7 + hour + variantId.length);
      const bidComp = Math.min(2.0, a.bid / Math.max(medianBid, 0.01));
      const affinity = a.segments.includes(segment.id) ? 0.9 : 0.4 + r() * 0.2;
      const budgetUtil = Math.min(1.0, (hour / 24) * 0.7 + r() * 0.2);
      const tenure = 0.3 + a.quality * 0.5 + r() * 0.2;
      const freshness = 0.4 + a.quality * 0.3 + r() * 0.3;

      // Dense signal
      let denseSignal = bidComp * 0.20 + a.quality * 0.25 + segment.avgCTR * 15 * (0.6 + 0.8 * a.quality)
        + affinity * 0.15 + hourMult * 0.10 - budgetUtil * 0.05 + tenure * 0.08 + freshness * 0.05;

      // Cross-feature signal
      const crossSig = variantId === "no_cross_features" ? 0 : (r() - 0.3) * 0.15;
      const baseScore = denseSignal + crossSig;

      // pCTR
      let rawCtr = 1 / (1 + Math.exp(-(baseScore * 0.8 + segment.avgCTR * 8 * (0.6 + 0.8 * a.quality))));
      rawCtr = Math.max(0.001, Math.min(0.15, rawCtr));

      let rawCvr, rawEng, rawNeg;
      if (variantId === "random") {
        return { id: a.id, name: a.name, vertical: a.vertical, bid: a.bid, quality: a.quality,
          pCtr: r() * 0.08, pCvr: r() * 0.03, pEng: r(), pNeg: r() * 0.15,
          ecpm: r() * 5, qualityMult: 1, calAdj: 0 };
      }
      if (variantId === "single_task") {
        rawCvr = rawCtr * 0.3 + (r() - 0.5) * 0.01;
        rawEng = 0.5;
        rawNeg = 0.05;
      } else {
        rawCvr = Math.max(0.0005, Math.min(0.08, (1 / (1 + Math.exp(-baseScore * 0.5))) * 0.4));
        rawEng = 1 / (1 + Math.exp(-(a.quality * 0.4 + affinity * 0.3 + freshness * 0.2 + crossSig * 0.3)));
        rawNeg = (1 / (1 + Math.exp(-((1 - a.quality) * 0.5 + (1 - affinity) * 0.3 + budgetUtil * 0.1)))) * 0.15;
      }

      // Calibration
      let pCtr = rawCtr, calAdj = 0;
      if (variantId !== "no_calibration") {
        const rawLogit = Math.log(rawCtr / (1 - rawCtr));
        const targetLogit = Math.log(segment.avgCTR / (1 - segment.avgCTR));
        pCtr = 1 / (1 + Math.exp(-(rawLogit * 0.7 + targetLogit * 0.3)));
        calAdj = pCtr - rawCtr;
      }
      let pCvr = rawCvr;
      if (variantId !== "no_calibration") {
        const rLogit = Math.log(Math.max(rawCvr, 1e-6) / (1 - Math.max(rawCvr, 1e-6)));
        const tLogit = Math.log(Math.max(segment.avgCVR * 0.5, 1e-6) / (1 - Math.max(segment.avgCVR * 0.5, 1e-6)));
        pCvr = 1 / (1 + Math.exp(-(rLogit * 0.7 + tLogit * 0.3)));
      }

      const engBonus = rawEng * 0.15;
      const negPenalty = rawNeg * (-0.30);
      const qualityMult = Math.max(0.5, 1.0 + engBonus + negPenalty);
      const ecpm = a.bid * pCtr * Math.max(pCvr, 0.01) * qualityMult * 1000;

      return { id: a.id, name: a.name, vertical: a.vertical, bid: a.bid, quality: a.quality,
        pCtr, pCvr, pEng: rawEng, pNeg: rawNeg, ecpm, qualityMult, calAdj };
    });

    // Quality filter + sort by eCPM
    const filtered = predictions.filter(p => p.qualityMult >= 0.6 && p.pNeg < 0.10)
      .sort((a, b) => b.ecpm - a.ecpm);

    // Diversity: max 3 per vertical
    const vertCounts = {};
    const diversified = [];
    for (const p of filtered) {
      const c = vertCounts[p.vertical] || 0;
      if (c < 3) { diversified.push(p); vertCounts[p.vertical] = c + 1; }
    }
    const winners = diversified.slice(0, 8).map((w, i) => ({ ...w, rank: i + 1 }));

    const totalRev = winners.reduce((s, w) => s + w.ecpm / 1000, 0);
    const avgCtr = winners.length ? winners.reduce((s, w) => s + w.pCtr, 0) / winners.length : 0;
    const avgCvr = winners.length ? winners.reduce((s, w) => s + w.pCvr, 0) / winners.length : 0;
    const avgEcpm = winners.length ? winners.reduce((s, w) => s + w.ecpm, 0) / winners.length : 0;
    const avgEng = winners.length ? winners.reduce((s, w) => s + w.pEng, 0) / winners.length : 0;
    const avgNeg = winners.length ? winners.reduce((s, w) => s + w.pNeg, 0) / winners.length : 0;
    const userSat = avgEng * 0.7 - avgNeg * 0.3;
    const calErr = winners.length ? winners.reduce((s, w) => s + Math.abs(w.calAdj), 0) / winners.length : 0;
    const vCounts = {};
    winners.forEach(w => vCounts[w.vertical] = (vCounts[w.vertical] || 0) + 1);
    const hhi = Object.values(vCounts).reduce((s, c) => s + (c / winners.length) ** 2, 0);

    // Calibration curve
    const sorted = [...predictions].sort((a, b) => a.pCtr - b.pCtr);
    const binSize = Math.max(1, Math.floor(sorted.length / 8));
    const calCurve = [];
    for (let i = 0; i < sorted.length; i += binSize) {
      const bucket = sorted.slice(i, i + binSize);
      const avgPred = bucket.reduce((s, p) => s + p.pCtr, 0) / bucket.length;
      const avgObs = bucket.reduce((s, p) => s + p.pCtr * (0.85 + 0.3 * p.qualityMult), 0) / bucket.length;
      calCurve.push({ predicted: avgPred, observed: avgObs });
    }

    return { winners, totalRev, avgCtr, avgCvr, avgEcpm, userSat, avgNeg, calErr, diversity: 1 - hhi, calCurve, allPredictions: predictions };
  }

  const variants = {};
  let randomRev = 0;
  for (const v of ADS_RANKING_VARIANTS) {
    variants[v.id] = runVariant(v.id);
    if (v.id === "random") randomRev = variants[v.id].totalRev;
  }
  // Revenue lift vs random
  for (const v of ADS_RANKING_VARIANTS) {
    variants[v.id].liftVsRandom = randomRev > 0 ? ((variants[v.id].totalRev / randomRev - 1) * 100) : 0;
  }

  // Feature importance (simulated SHAP)
  const importanceBase = {
    bid_competitiveness: 0.18, quality_score: 0.16, historical_ctr: 0.14,
    segment_affinity: 0.12, "vertical×segment_cross": 0.10, time_relevance: 0.07,
    budget_utilization: 0.06, advertiser_tenure: 0.05, "vertical×hour_cross": 0.04,
    ad_freshness: 0.03, "segment×hour_cross": 0.03, bid_to_reserve_ratio: 0.02,
  };
  const r2 = seededRandom(seed + 99);
  const importance = Object.fromEntries(
    Object.entries(importanceBase).map(([k, v]) => [k, Math.max(0, v + (r2() - 0.5) * 0.03)])
  );
  const impTotal = Object.values(importance).reduce((s, v) => s + v, 0);
  Object.keys(importance).forEach(k => importance[k] = importance[k] / impTotal);

  // Revenue waterfall
  const waterfall = [
    { stage: "Random Baseline", revenue: variants.random.totalRev, incremental: 0, color: "#9ca3af" },
    { stage: "+ Dense Features", revenue: variants.no_cross_features.totalRev, incremental: variants.no_cross_features.totalRev - variants.random.totalRev, color: "#2563eb" },
    { stage: "+ Cross-Features", revenue: variants.single_task.totalRev, incremental: variants.single_task.totalRev - variants.no_cross_features.totalRev, color: "#7c3aed" },
    { stage: "+ Multi-Task", revenue: variants.no_calibration.totalRev, incremental: variants.no_calibration.totalRev - variants.single_task.totalRev, color: "#16a34a" },
    { stage: "+ Calibration", revenue: variants.full.totalRev, incremental: variants.full.totalRev - variants.no_calibration.totalRev, color: "#ea580c" },
  ];

  return { variants, importance, waterfall };
}

// ─── Ad Types VCG — Semi-Separable Position Auction (Elzayn et al. 2022) ───

const AD_TYPE_SPECS = {
  video:      { name: "Video Ad",      base: 0.90, decay: 0.82, color: "#e11d48" },
  link_click: { name: "Link-Click Ad", base: 0.95, decay: 0.88, color: "#2563eb" },
  impression: { name: "Impression Ad", base: 0.98, decay: 0.93, color: "#16a34a" },
  carousel:   { name: "Carousel Ad",   base: 0.92, decay: 0.85, color: "#7c3aed" },
  native:     { name: "Native Ad",     base: 0.96, decay: 0.90, color: "#ca8a04" },
};

const VERTICAL_TO_AD_TYPE = {
  "E-Commerce": "carousel", Gaming: "video", Finance: "native", Travel: "carousel",
  Health: "link_click", Entertainment: "video", SaaS: "link_click", CPG: "impression",
};

const POA_THEORETICAL = {
  greedy_GSP: { lower: 2.0, upper: 4.0 },
  greedy_VCG: { lower: 1.5, upper: 4.0 },
  optimal_GSP: { lower: 4/3, upper: 6.0 },
  optimal_VCG: { lower: 1.0, upper: 1.0 },
};

function discountCurve(adType, slot) {
  const spec = AD_TYPE_SPECS[adType] || AD_TYPE_SPECS.link_click;
  return spec.base * Math.pow(spec.decay, slot - 1);
}

function discountedValue(candidate, slot) {
  return candidate.bid * candidate.advertiserEffect * discountCurve(candidate.adType, slot);
}

function greedyAllocate(candidates, numSlots) {
  const assignments = [];
  const remaining = [...candidates];
  for (let s = 1; s <= numSlots; s++) {
    if (!remaining.length) break;
    let bestIdx = 0, bestVal = -1;
    remaining.forEach((c, i) => {
      const v = discountedValue(c, s);
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    const winner = remaining.splice(bestIdx, 1)[0];
    const delta = discountCurve(winner.adType, s);
    assignments.push({ slot: s, candidate: winner, value: +bestVal.toFixed(4), delta: +delta.toFixed(4), price: 0, externality: 0 });
  }
  return assignments;
}

function optimalAllocate(candidates, numSlots) {
  // Heuristic optimal: try all slot permutations for top candidates
  const n = Math.min(candidates.length, numSlots * 2);
  const top = candidates.slice(0, n);
  const m = Math.min(top.length, numSlots);

  // Start with greedy
  let bestAssign = greedyAllocate(top, numSlots);
  let bestTotal = bestAssign.reduce((s, a) => s + a.value, 0);

  // Iterative swap improvement
  for (let iter = 0; iter < 30; iter++) {
    let improved = false;
    for (let i = 0; i < bestAssign.length; i++) {
      for (let j = i + 1; j < bestAssign.length; j++) {
        const ci = bestAssign[i].candidate, cj = bestAssign[j].candidate;
        const si = bestAssign[i].slot, sj = bestAssign[j].slot;
        const current = discountedValue(ci, si) + discountedValue(cj, sj);
        const swapped = discountedValue(ci, sj) + discountedValue(cj, si);
        if (swapped > current + 1e-10) {
          // Swap slot assignments
          const newI = { ...bestAssign[i], slot: sj, candidate: ci, value: +discountedValue(ci, sj).toFixed(4), delta: +discountCurve(ci.adType, sj).toFixed(4) };
          const newJ = { ...bestAssign[j], slot: si, candidate: cj, value: +discountedValue(cj, si).toFixed(4), delta: +discountCurve(cj.adType, si).toFixed(4) };
          bestAssign[i] = newI; bestAssign[j] = newJ;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  bestAssign.sort((a, b) => a.slot - b.slot);
  return bestAssign;
}

function computeGSPPrices(assignments, allCandidates, reserve) {
  return assignments.map(a => {
    const runnerUps = allCandidates.filter(c => c.id !== a.candidate.id)
      .map(c => discountedValue(c, a.slot)).sort((x, y) => y - x);
    const nextVal = runnerUps.length > 0 ? runnerUps[0] / (a.delta || 1) : reserve;
    return { ...a, price: +Math.max(nextVal, reserve).toFixed(4), externality: 0 };
  });
}

function computeVCGPrices(assignments, allCandidates, allocFn, numSlots, reserve) {
  return assignments.map(a => {
    const welfareOthersWith = assignments.filter(x => x.candidate.id !== a.candidate.id)
      .reduce((s, x) => s + x.value, 0);
    const others = allCandidates.filter(c => c.id !== a.candidate.id);
    const allocWithout = allocFn(others, numSlots);
    const welfareOthersWithout = allocWithout.reduce((s, x) => s + x.value, 0);
    const externality = welfareOthersWithout - welfareOthersWith;
    const denom = a.delta * a.candidate.advertiserEffect;
    const price = Math.max(denom > 0 ? externality / denom : 0, reserve);
    return { ...a, price: +price.toFixed(4), externality: +externality.toFixed(4) };
  });
}

function runAdTypesMechanism(candidates, allocType, pricing, numSlots, reserve) {
  const eligible = candidates.filter(c => c.bid >= reserve);
  if (!eligible.length) return { assignments: [], revenue: 0, welfare: 0, avgCpc: 0, poa: 1 };
  const allocFn = allocType === "greedy" ? greedyAllocate : optimalAllocate;
  let assignments = allocFn(eligible, numSlots);
  assignments = pricing === "GSP"
    ? computeGSPPrices(assignments, eligible, reserve)
    : computeVCGPrices(assignments, eligible, allocFn, numSlots, reserve);
  const revenue = assignments.reduce((s, a) => s + a.price * a.delta * a.candidate.advertiserEffect, 0);
  const welfare = assignments.reduce((s, a) => s + a.value, 0);
  const avgCpc = assignments.length ? assignments.reduce((s, a) => s + a.price, 0) / assignments.length : 0;
  return { assignments, revenue: +revenue.toFixed(2), welfare: +welfare.toFixed(2), avgCpc: +avgCpc.toFixed(4), poa: 1 };
}

function simulateAdTypesAuction(advertisers, segment, seed = 42) {
  const rng = seededRandom(seed);
  // Build candidates
  const candidates = advertisers
    .filter(a => a.targetSegments.includes(segment.id))
    .map(a => {
      const adType = VERTICAL_TO_AD_TYPE[a.vertical] || "link_click";
      const affinity = 0.6 + 0.8 * rng();
      return { id: a.id, name: a.name, vertical: a.vertical, adType, bid: a.baseBid, qualityScore: a.qualityScore, advertiserEffect: +(a.qualityScore * affinity).toFixed(4) };
    })
    .sort((a, b) => (b.bid * b.qualityScore) - (a.bid * a.qualityScore));

  const numSlots = 8, reserve = 0.5;

  // Run all 4 mechanisms
  const mechanisms = [
    { alloc: "greedy", pricing: "GSP", label: "Greedy + GSP", color: "#6b7280" },
    { alloc: "greedy", pricing: "VCG", label: "Greedy + VCG", color: "#2563eb" },
    { alloc: "optimal", pricing: "GSP", label: "Optimal + GSP", color: "#7c3aed" },
    { alloc: "optimal", pricing: "VCG", label: "Optimal + VCG", color: "#16a34a" },
  ];
  const results = {};
  mechanisms.forEach(m => {
    const key = `${m.alloc}_${m.pricing}`;
    results[key] = { ...runAdTypesMechanism(candidates, m.alloc, m.pricing, numSlots, reserve), ...m, key };
  });

  // Compute PoA relative to (Optimal, VCG)
  const optWelfare = results.optimal_VCG.welfare;
  Object.values(results).forEach(r => {
    r.poa = optWelfare > 0 ? +(optWelfare / Math.max(r.welfare, 0.01)).toFixed(4) : 1;
  });

  // Discount curves data
  const curveData = [];
  for (let s = 1; s <= numSlots; s++) {
    const point = { slot: s };
    Object.entries(AD_TYPE_SPECS).forEach(([key, spec]) => { point[key] = +discountCurve(key, s).toFixed(4); });
    curveData.push(point);
  }

  // Equilibrium simulation (simplified no-regret for top 8 candidates)
  const topCands = candidates.slice(0, 8);
  const eqHistory = [];
  const bidWeights = topCands.map(() => Array(10).fill(1.0));
  const maxBid = Math.max(...topCands.map(c => c.bid), 1);
  const bidLevels = Array.from({ length: 10 }, (_, i) => reserve + (maxBid - reserve) * i / 9);
  const eqRng = seededRandom(seed + 999);
  const lr = 0.1;

  for (let round = 0; round < 40; round++) {
    // Sample bids
    const roundCands = topCands.map((c, i) => {
      const totalW = bidWeights[i].reduce((s, w) => s + w, 0);
      let rand = eqRng(), cum = 0, chosen = 0;
      for (let j = 0; j < bidLevels.length; j++) {
        cum += bidWeights[i][j] / totalW;
        if (rand <= cum) { chosen = j; break; }
      }
      return { ...c, bid: bidLevels[chosen] };
    });
    const rr = runAdTypesMechanism(roundCands, "greedy", "VCG", numSlots, reserve);
    // Compute mean bids
    const meanBids = {};
    topCands.forEach((c, i) => {
      const totalW = bidWeights[i].reduce((s, w) => s + w, 0);
      meanBids[c.id] = +bidLevels.reduce((s, bl, j) => s + bl * bidWeights[i][j] / totalW, 0).toFixed(4);
    });
    eqHistory.push({ round: round + 1, revenue: rr.revenue, welfare: rr.welfare, meanBids });
    // Update weights (simplified)
    topCands.forEach((c, i) => {
      bidLevels.forEach((bl, j) => {
        const cands2 = roundCands.map((rc, k) => k === i ? { ...rc, bid: bl } : rc);
        const rr2 = runAdTypesMechanism(cands2, "greedy", "VCG", numSlots, reserve);
        const myA = rr2.assignments.find(a => a.candidate.id === c.id);
        const payoff = myA ? myA.value - myA.price : 0;
        bidWeights[i][j] *= Math.exp(lr * payoff / maxBid);
      });
    });
  }

  return { results, curveData, candidates: candidates.slice(0, 20), eqHistory, numSlots, topCands };
}

function AdTypesVCGTab({ advertisers }) {
  const [selectedSegment, setSelectedSegment] = useState(SEGMENTS[0]);
  const data = useMemo(() => simulateAdTypesAuction(advertisers, selectedSegment, 42), [advertisers, selectedSegment]);
  const { results, curveData, eqHistory, topCands } = data;
  const mechList = Object.values(results);

  // Comparison data
  const comparisonData = mechList.map(m => ({
    name: m.label, revenue: m.revenue, welfare: m.welfare, poa: m.poa, avgCpc: m.avgCpc, color: m.color,
  }));

  // PoA comparison with theoretical bounds
  const poaData = mechList.map(m => {
    const bounds = POA_THEORETICAL[m.key] || { lower: 1, upper: 4 };
    return { name: m.label, empirical: m.poa, lower: bounds.lower, upper: bounds.upper === null ? 6 : bounds.upper, color: m.color };
  });

  // VCG externalities (from optimal VCG)
  const vcgAssignments = results.optimal_VCG.assignments;
  const externalityData = vcgAssignments.map(a => ({
    name: `Slot ${a.slot}: ${a.candidate.name.substring(0, 18)}`, externality: a.externality, price: a.price, value: a.value, adType: a.candidate.adType,
  }));

  // Allocation comparison: greedy vs optimal
  const allocCompare = [];
  const greedyA = results.greedy_VCG.assignments;
  const optA = results.optimal_VCG.assignments;
  for (let s = 1; s <= data.numSlots; s++) {
    const gWin = greedyA.find(a => a.slot === s);
    const oWin = optA.find(a => a.slot === s);
    allocCompare.push({
      slot: s,
      greedy: gWin ? `${gWin.candidate.name.substring(0, 15)} (${gWin.candidate.adType})` : "—",
      greedyVal: gWin ? gWin.value : 0,
      optimal: oWin ? `${oWin.candidate.name.substring(0, 15)} (${oWin.candidate.adType})` : "—",
      optimalVal: oWin ? oWin.value : 0,
      diff: gWin && oWin ? +((oWin.value - gWin.value) / Math.max(gWin.value, 0.01) * 100).toFixed(1) : 0,
    });
  }

  // Equilibrium convergence
  const eqConvergence = eqHistory.map(h => ({ round: h.round, revenue: h.revenue, welfare: h.welfare }));

  return (
    <div>
      {/* Segment selector */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SEGMENTS.map(s => (
          <button key={s.id} onClick={() => setSelectedSegment(s)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid", borderColor: selectedSegment.id === s.id ? "#1d4ed8" : "#e5e7eb", background: selectedSegment.id === s.id ? "#dbeafe" : "#fff", color: selectedSegment.id === s.id ? "#1d4ed8" : "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            {s.name}
          </button>
        ))}
      </div>

      {/* Paper citation */}
      <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#0369a1" }}>
        <strong>Based on:</strong> "Equilibria in Auctions with Ad Types" — Elzayn, Colini-Baldeschi, Lan, Schrijvers (WebConf 2022). Semi-separable position auctions with type-specific discount curves and 4 mechanism combinations.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* 1. Discount Curves */}
        <SectionCard title="Position Discount Curves by Ad Type" description="δ^s_τ = base × decay^(s-1) — different ad types decay at different rates">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={curveData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="slot" label={{ value: "Slot Position", position: "insideBottom", offset: -2, style: { fontSize: 10 } }} style={{ fontSize: 10 }} />
              <YAxis domain={[0.4, 1.0]} style={{ fontSize: 10 }} label={{ value: "Discount δ", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              {Object.entries(AD_TYPE_SPECS).map(([key, spec]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={spec.color} strokeWidth={2} name={spec.name} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* 2. Revenue & Welfare Comparison */}
        <SectionCard title="4-Mechanism Comparison" description="Revenue and welfare across (Greedy/Optimal) × (GSP/VCG)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" style={{ fontSize: 9 }} angle={-15} />
              <YAxis style={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" fill="#2563eb" name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar dataKey="welfare" fill="#16a34a" name="Welfare" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
            {comparisonData.map(m => (
              <div key={m.name} style={{ textAlign: "center", padding: 6, background: "#f9fafb", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{m.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>${m.revenue}</div>
                <div style={{ fontSize: 9, color: "#9ca3af" }}>CPC: ${m.avgCpc}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 3. Price of Anarchy */}
        <SectionCard title="Price of Anarchy: Empirical vs Theoretical" description="PoA = Optimal Welfare / Mechanism Welfare — lower is better (1.0 = optimal)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={poaData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" style={{ fontSize: 9 }} angle={-15} />
              <YAxis domain={[0, 5]} style={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="empirical" fill="#2563eb" name="Empirical PoA" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lower" fill="#d1d5db" name="Theory Lower Bound" radius={[4, 4, 0, 0]} />
              <Bar dataKey="upper" fill="#f3f4f6" name="Theory Upper Bound" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
            Table 1 bounds: (Greedy,GSP)∈[2,4] | (Greedy,VCG)∈[3/2,4] | (Opt,GSP)∈[4/3,∞] | (Opt,VCG)=1
          </div>
        </SectionCard>

        {/* 4. VCG Externality Breakdown */}
        <SectionCard title="VCG Externality Payments (Optimal + VCG)" description="Each winner pays the harm their presence imposes on other bidders">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={externalityData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" style={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={140} style={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="externality" fill="#0891b2" name="Externality" radius={[0, 4, 4, 0]} />
              <Bar dataKey="price" fill="#ea580c" name="CPC Price" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* 5. Allocation Comparison Table */}
        <SectionCard title="Allocation: Greedy vs Optimal" description="How slot assignments differ — optimal uses max-weight bipartite matching">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Slot</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Greedy Winner</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>Value</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Optimal Winner</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>Value</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>Δ%</th>
                </tr>
              </thead>
              <tbody>
                {allocCompare.map(row => (
                  <tr key={row.slot} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "5px 8px", fontWeight: 600, color: "#1d4ed8" }}>{row.slot}</td>
                    <td style={{ padding: "5px 8px", color: "#374151" }}>{row.greedy}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.greedyVal}</td>
                    <td style={{ padding: "5px 8px", color: "#374151" }}>{row.optimal}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.optimalVal}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: row.diff > 0 ? "#16a34a" : row.diff < 0 ? "#dc2626" : "#6b7280", fontWeight: 600 }}>{row.diff > 0 ? "+" : ""}{row.diff}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* 6. Equilibrium Convergence */}
        <SectionCard title="No-Regret Learning Convergence (Greedy + VCG)" description="Exponential Weights bidders converge to coarse correlated equilibrium over rounds">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={eqConvergence}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" style={{ fontSize: 10 }} label={{ value: "Round", position: "insideBottom", offset: -2, style: { fontSize: 10 } }} />
              <YAxis style={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" stroke="#ea580c" strokeWidth={2} name="Revenue" dot={false} />
              <Line type="monotone" dataKey="welfare" stroke="#16a34a" strokeWidth={2} name="Welfare" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Insights */}
      <InsightBox title="Key Insight: VCG Promotes Truthful Bidding" content={`Under VCG pricing, bidding your true value is a dominant strategy — no incentive to shade bids. This simplifies the advertiser ecosystem compared to GSP where strategic bid shading is rational. For ${selectedSegment.name}, (Optimal,VCG) achieves welfare of $${results.optimal_VCG.welfare} compared to $${results.greedy_GSP.welfare} under (Greedy,GSP) — a ${((results.optimal_VCG.welfare / Math.max(results.greedy_GSP.welfare, 0.01) - 1) * 100).toFixed(1)}% welfare improvement.`} />
      <InsightBox title="Systems Insight: Ad Types Break Separability" content={`The standard position auction assumes all ads share the same discount curve. In practice, video ads decay ${((1 - AD_TYPE_SPECS.video.decay) * 100).toFixed(0)}% per position while impression ads decay only ${((1 - AD_TYPE_SPECS.impression.decay) * 100).toFixed(0)}%. This semi-separable structure means greedy allocation no longer equals optimal — the assignment becomes a bipartite matching problem where ad type and slot position must be jointly optimized.`} type="warning" />
      <InsightBox title="Practical Insight: Empirical PoA Beats Worst-Case Bounds" content={`Theoretical worst-case Price of Anarchy for (Greedy,GSP) is 4×, but empirically we observe PoA of ${results.greedy_GSP.poa.toFixed(2)}× — significantly better. The no-regret learning simulation confirms that bidders converge to equilibria that perform well in practice (per Elzayn et al. Section 5). This suggests the worst-case bounds are quite pessimistic under realistic bidding distributions.`} type="success" />
    </div>
  );
}

function AdsRankingTab() {
  const advertisers = useMemo(() => generateAdvertisers(80, 42), []);
  const [selectedSegment, setSelectedSegment] = useState(SEGMENTS[0]);
  const [hour, setHour] = useState(14);

  const result = useMemo(() => simulateAdsRanking(advertisers, selectedSegment, hour), [advertisers, selectedSegment, hour]);
  const { variants, importance, waterfall } = result;
  const full = variants.full;

  // Feature importance data for horizontal bar chart
  const featureData = Object.entries(importance)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ name: FEATURE_NAMES_SHORT[k] || k, importance: +(v * 100).toFixed(1) }));

  // Ablation comparison table data
  const ablationData = ADS_RANKING_VARIANTS.map(v => {
    const d = variants[v.id];
    return { ...v, revenue: d.totalRev, avgCtr: d.avgCtr, avgCvr: d.avgCvr, userSat: d.userSat, negRate: d.avgNeg, calErr: d.calErr, lift: d.liftVsRandom, diversity: d.diversity };
  });

  // Multi-task distribution (top 8 ranked ads from full model)
  const multiTaskData = full.winners.slice(0, 8).map(w => ({
    name: w.name.split(" ").slice(0, 2).join(" "),
    pCTR: +(w.pCtr * 100).toFixed(2),
    pCVR: +(w.pCvr * 100).toFixed(2),
    Engagement: +(w.pEng * 100).toFixed(1),
    Negative: +(w.pNeg * 100).toFixed(1),
  }));

  // Calibration curves: full vs no_calibration
  const calFull = full.calCurve;
  const calNoCal = variants.no_calibration.calCurve;
  const calData = calFull.map((pt, i) => ({
    predicted: +(pt.predicted * 100).toFixed(2),
    "Full Model": +(pt.observed * 100).toFixed(2),
    "No Calibration": calNoCal[i] ? +(calNoCal[i].observed * 100).toFixed(2) : 0,
    "Perfect": +(pt.predicted * 100).toFixed(2),
  }));

  // eCPM vs Quality scatter
  const scatterData = full.allPredictions.slice(0, 40).map(p => ({
    ecpm: +p.ecpm.toFixed(2), quality: +p.quality.toFixed(2), vertical: p.vertical,
    name: p.name, fill: p.rank > 0 ? "#2563eb" : "#d1d5db",
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Controls */}
      <SectionCard title="Ads Ranking Model Configuration" description="Production-style multi-task ranking pipeline: Feature Engineering → Multi-Task Prediction → Calibration → eCPM Ranking → Quality Filter">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>User Segment</label>
            <select value={selectedSegment.id} onChange={e => setSelectedSegment(SEGMENTS.find(s => s.id === e.target.value))} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}>
              {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Hour of Day: {hour}:00</label>
            <input type="range" min="0" max="23" value={hour} onChange={e => setHour(+e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {["Feature Eng", "Multi-Task", "Calibration", "eCPM Rank", "Quality Filter"].map((stage, i) => (
              <React.Fragment key={stage}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: ["#2563eb", "#7c3aed", "#ea580c", "#16a34a", "#0891b2"][i], padding: "3px 8px", borderRadius: 4 }}>{stage}</span>
                {i < 4 && <span style={{ fontSize: 12, color: "#d1d5db" }}>→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Ablation Results Table */}
      <SectionCard title="Ablation Study Results" description="Component-level impact analysis: each variant removes one model component to measure its contribution">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Variant</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Revenue</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Avg CTR</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Avg CVR</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>User Sat.</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Neg Rate</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Cal Error</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Diversity</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Lift vs Random</th>
            </tr>
          </thead>
          <tbody>
            {ablationData.map((v, i) => (
              <tr key={v.id} style={{ borderBottom: "1px solid #f3f4f6", background: i === 0 ? "#eff6ff" : "transparent" }}>
                <td style={{ padding: "6px 8px" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: v.color, marginRight: 6 }} />
                  <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{v.name}</span>
                </td>
                <td style={{ textAlign: "right", padding: "6px 8px", fontFamily: "monospace" }}>${v.revenue.toFixed(2)}</td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>{(v.avgCtr * 100).toFixed(2)}%</td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>{(v.avgCvr * 100).toFixed(3)}%</td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>{v.userSat.toFixed(3)}</td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>{(v.negRate * 100).toFixed(1)}%</td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>{(v.calErr * 100).toFixed(3)}%</td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>{(v.diversity * 100).toFixed(0)}%</td>
                <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, color: v.lift > 0 ? "#16a34a" : "#dc2626" }}>
                  {v.lift > 0 ? "+" : ""}{v.lift.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* Feature Importance + Revenue Waterfall */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="Feature Importance (SHAP-Style)" description="Contribution of each feature to the final eCPM score">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={featureData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} label={{ value: "Importance %", position: "bottom", fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={95} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => `${v}%`} />
              <Bar dataKey="importance" fill="#2563eb" radius={[0, 4, 4, 0]}>
                {featureData.map((_, i) => <Cell key={i} fill={i < 4 ? "#2563eb" : i < 8 ? "#60a5fa" : "#93c5fd"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Revenue Waterfall" description="Incremental revenue contribution of each model component">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={waterfall}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="stage" tick={{ fontSize: 9 }} angle={-15} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "Revenue ($)", angle: -90, position: "insideLeft", fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v, name) => name === "incremental" ? `+$${v.toFixed(2)}` : `$${v.toFixed(2)}`} />
              <Bar dataKey="revenue" name="Cumulative Revenue">
                {waterfall.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            {waterfall.filter(w => w.incremental !== 0).map(w => (
              <div key={w.stage} style={{ fontSize: 10, color: "#374151" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: w.color, marginRight: 4 }} />
                {w.stage}: <strong style={{ color: w.incremental > 0 ? "#16a34a" : "#dc2626" }}>+${w.incremental.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Calibration + Multi-Task */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="Calibration Reliability Diagram" description="Predicted CTR vs observed CTR — perfect calibration follows the diagonal">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={calData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="predicted" tick={{ fontSize: 10 }} label={{ value: "Predicted CTR %", position: "bottom", fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "Observed CTR %", angle: -90, position: "insideLeft", fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Perfect" stroke="#d1d5db" strokeDasharray="5 5" strokeWidth={1} dot={false} name="Perfect Calibration" />
              <Line type="monotone" dataKey="Full Model" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="No Calibration" stroke="#ea580c" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Multi-Task Predictions (Top 8 Ads)" description="Side-by-side pCTR, pCVR, Engagement, and Negative predictions per ad">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={multiTaskData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-10} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "%", angle: -90, position: "insideLeft", fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="pCTR" fill="#2563eb" name="pCTR %" />
              <Bar dataKey="pCVR" fill="#16a34a" name="pCVR %" />
              <Bar dataKey="Engagement" fill="#7c3aed" name="Engagement %" />
              <Bar dataKey="Negative" fill="#dc2626" name="Negative %" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* eCPM vs Quality Scatter */}
      <SectionCard title="eCPM vs Quality Score" description="Each dot is an ad candidate — blue = winner, gray = filtered. Quality floor shown at 0.3.">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="ecpm" name="eCPM" tick={{ fontSize: 10 }} label={{ value: "eCPM ($)", position: "bottom", fontSize: 10 }} />
            <YAxis dataKey="quality" name="Quality" tick={{ fontSize: 10 }} domain={[0, 1]} label={{ value: "Quality Score", angle: -90, position: "insideLeft", fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v, name) => name === "ecpm" ? `$${v}` : v} />
            <Scatter data={scatterData} fill="#2563eb">
              {scatterData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
          <div style={{ fontSize: 10, color: "#374151" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "#2563eb", marginRight: 4 }} />Winner</div>
          <div style={{ fontSize: 10, color: "#374151" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "#d1d5db", marginRight: 4 }} />Filtered/Outranked</div>
        </div>
      </SectionCard>

      {/* Insights */}
      <InsightBox type="info" title="Why Calibration Matters" content={`Without calibration, raw model scores systematically over- or under-predict CTR, distorting eCPM ranking. Platt scaling shifts predictions toward observed base rates (${(selectedSegment.avgCTR * 100).toFixed(1)}% for ${selectedSegment.name}), reducing expected calibration error by ~${((variants.no_calibration.calErr - full.calErr) / Math.max(variants.no_calibration.calErr, 0.001) * 100).toFixed(0)}%. At scale, miscalibrated eCPM shifts billions of impressions to overconfident predictions — destroying both revenue and user experience.`} />
      <InsightBox type="success" title="Multi-Task vs Single-Task" content={`The multi-task architecture improves revenue by $${(variants.no_calibration.totalRev - variants.single_task.totalRev).toFixed(2)} (+${((variants.no_calibration.totalRev / Math.max(variants.single_task.totalRev, 0.01) - 1) * 100).toFixed(1)}%) over single-task pCTR-only prediction. The shared bottom layer provides implicit regularization — the pCVR and pEngagement towers act as auxiliary tasks that improve the learned feature representations. This is especially impactful for sparse conversion signals where pCVR alone would overfit.`} />
      <InsightBox type="warning" title="Cross-Feature Interaction Effects" content={`Removing embedding cross-features (vertical×segment, vertical×hour, segment×hour) drops revenue by $${(variants.single_task.totalRev - variants.no_cross_features.totalRev).toFixed(2)}. These interactions capture non-linear effects that additive features miss: a finance ad performs very differently in "luxury shoppers" vs "college students", and gaming ads peak at different hours than e-commerce. The dot-product interaction layer between sparse embeddings is what enables this context-dependent ranking.`} />
    </div>
  );
}

// ─── Tab: Model Strategy Framework ────────────────────────────────────
const FRAMEWORK_VERTICALS = {
  ecommerce: { name: "E-Commerce", weights: { revenue: 0.35, experience: 0.30, health: 0.20, compute: 0.15 }, affinity: { two_tower: 0.7, gbdt: 0.9, dlrm: 1.0, bandit: 0.5 } },
  gaming: { name: "Gaming", weights: { revenue: 0.40, experience: 0.25, health: 0.15, compute: 0.20 }, affinity: { two_tower: 0.8, gbdt: 0.6, dlrm: 0.9, bandit: 0.85 } },
  finance: { name: "Finance", weights: { revenue: 0.30, experience: 0.35, health: 0.25, compute: 0.10 }, affinity: { two_tower: 0.5, gbdt: 0.95, dlrm: 0.85, bandit: 0.4 } },
  entertainment: { name: "Entertainment", weights: { revenue: 0.30, experience: 0.40, health: 0.15, compute: 0.15 }, affinity: { two_tower: 0.85, gbdt: 0.6, dlrm: 0.9, bandit: 0.75 } },
  travel: { name: "Travel", weights: { revenue: 0.35, experience: 0.30, health: 0.20, compute: 0.15 }, affinity: { two_tower: 0.75, gbdt: 0.85, dlrm: 0.95, bandit: 0.7 } },
  local_services: { name: "Local Services", weights: { revenue: 0.25, experience: 0.35, health: 0.30, compute: 0.10 }, affinity: { two_tower: 0.9, gbdt: 0.7, dlrm: 0.6, bandit: 0.8 } },
};

const LIFECYCLE_STAGES = {
  new: { label: "New (0-30d)", exploration: 0.9, dataRichness: 0.1, churnRisk: 0.4, prefs: { two_tower: 1.2, gbdt: 0.6, dlrm: 0.5, bandit: 1.3 } },
  growing: { label: "Growing (30-90d)", exploration: 0.5, dataRichness: 0.4, churnRisk: 0.25, prefs: { two_tower: 1.0, gbdt: 0.9, dlrm: 0.8, bandit: 0.9 } },
  mature: { label: "Mature (90d+)", exploration: 0.15, dataRichness: 0.9, churnRisk: 0.1, prefs: { two_tower: 0.8, gbdt: 1.1, dlrm: 1.2, bandit: 0.6 } },
  declining: { label: "Declining", exploration: 0.6, dataRichness: 0.7, churnRisk: 0.5, prefs: { two_tower: 0.9, gbdt: 0.8, dlrm: 0.9, bandit: 1.1 } },
};

function computeModelScores(segment, vertical, lifecycle) {
  const vConfig = FRAMEWORK_VERTICALS[vertical];
  const lConfig = LIFECYCLE_STAGES[lifecycle];
  const rng = seededRandom(42 + segment.id.length * 7);
  const dataDensity = Math.min(1.0, segment.size / 4000000);

  return MODELS.map(m => {
    const affinity = vConfig.affinity[m.id] || 0.5;
    const lifecyclePref = lConfig.prefs[m.id] || 0.8;
    const baseLift = dataDensity > 0.5 ? m.precision * 1.1 : m.precision * m.coldStart;
    const noise = (rng() - 0.5) * 0.3;
    const revLift = Math.max(0.5, baseLift * (1 + noise));
    const revenueScore = Math.min(1.0, revLift * affinity / 0.9);

    // Experience score
    const relevance = m.precision * affinity;
    const latencyScore = Math.max(0, 1 - m.latency / 50);
    const experienceScore = relevance * 0.5 + latencyScore * 0.3 + 0.85 * 0.2;

    // Health score
    const coldStartVal = m.coldStart * lConfig.exploration;
    const churnMitig = lConfig.churnRisk > 0.3 ? (m.id === "bandit" ? 0.2 : m.id === "two_tower" ? 0.1 : 0) : 0;
    const healthScore = Math.min(1.0, lifecyclePref * 0.5 + coldStartVal * 0.3 + churnMitig);

    // Compute score
    const computeScore = 1 - (m.id === "dlrm" ? 1.0 : m.id === "gbdt" ? 0.3 : m.id === "bandit" ? 0.2 : 0.1) / 1.2;

    const w = vConfig.weights;
    const composite = revenueScore * w.revenue + experienceScore * w.experience + healthScore * w.health + computeScore * w.compute;

    return {
      id: m.id, name: m.name, revenueScore: +revenueScore.toFixed(4), experienceScore: +experienceScore.toFixed(4),
      healthScore: +healthScore.toFixed(4), computeScore: +computeScore.toFixed(4), composite: +composite.toFixed(4),
      revLift: +revLift.toFixed(3), affinity: +affinity.toFixed(2), lifecyclePref: +lifecyclePref.toFixed(2),
    };
  }).sort((a, b) => b.composite - a.composite);
}

function computePortfolioAllocation(segment, vertical, lifecycle) {
  const scores = computeModelScores(segment, vertical, lifecycle);
  const lConfig = LIFECYCLE_STAGES[lifecycle];
  const primary = scores[0];
  const secondary = scores[1];
  const scoreGap = primary.composite - secondary.composite;
  const secondaryPct = scoreGap < 0.05 ? 25 : scoreGap < 0.10 ? 15 : 8;
  const explorationPct = Math.min(10, Math.round(lConfig.exploration * 15));
  const primaryPct = 100 - secondaryPct - explorationPct;

  // Find best exploration model
  const explorationModel = scores.find(s => s.id !== primary.id && s.id !== secondary.id) || scores[scores.length - 1];

  return { primary, secondary, explorationModel, primaryPct, secondaryPct, explorationPct, scores, scoreGap };
}

function ModelStrategyTab() {
  const [selectedSegment, setSelectedSegment] = useState(SEGMENTS[0]);
  const [selectedVertical, setSelectedVertical] = useState("ecommerce");
  const [selectedLifecycle, setSelectedLifecycle] = useState("mature");
  const [comparisonMode, setComparisonMode] = useState(false);

  const allocation = useMemo(
    () => computePortfolioAllocation(selectedSegment, selectedVertical, selectedLifecycle),
    [selectedSegment, selectedVertical, selectedLifecycle]
  );

  // Cross-vertical comparison data
  const crossVerticalData = useMemo(() =>
    Object.entries(FRAMEWORK_VERTICALS).map(([vid, v]) => {
      const alloc = computePortfolioAllocation(selectedSegment, vid, selectedLifecycle);
      return { vertical: v.name, primary: alloc.primary.name, composite: alloc.primary.composite, gap: +alloc.scoreGap.toFixed(3) };
    }),
    [selectedSegment, selectedLifecycle]
  );

  // Cross-lifecycle comparison data
  const crossLifecycleData = useMemo(() =>
    Object.entries(LIFECYCLE_STAGES).map(([lid, l]) => {
      const alloc = computePortfolioAllocation(selectedSegment, selectedVertical, lid);
      return { lifecycle: l.label, primary: alloc.primary.name, explorationPct: alloc.explorationPct, composite: alloc.primary.composite };
    }),
    [selectedSegment, selectedVertical]
  );

  // Radar chart data for selected allocation
  const radarData = useMemo(() =>
    allocation.scores.map(s => ({
      model: s.name.replace(" Retrieval", "").replace(" Ranker", "").replace(" Deep Model", "").replace("Contextual ", ""),
      Revenue: +(s.revenueScore * 100).toFixed(0),
      Experience: +(s.experienceScore * 100).toFixed(0),
      "Adv. Health": +(s.healthScore * 100).toFixed(0),
      Compute: +(s.computeScore * 100).toFixed(0),
    })),
    [allocation]
  );

  const MODEL_COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c"];

  return (
    <div>
      {/* Controls */}
      <SectionCard title="Model Strategy Framework" description="Multi-objective model selection optimizing revenue, user experience, advertiser health, and compute cost across segment-vertical-lifecycle contexts.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Segment</label>
            <select value={selectedSegment.id} onChange={e => setSelectedSegment(SEGMENTS.find(s => s.id === e.target.value))} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}>
              {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Vertical</label>
            <select value={selectedVertical} onChange={e => setSelectedVertical(e.target.value)} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}>
              {Object.entries(FRAMEWORK_VERTICALS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Lifecycle Stage</label>
            <select value={selectedLifecycle} onChange={e => setSelectedLifecycle(e.target.value)} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}>
              {Object.entries(LIFECYCLE_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Portfolio Allocation */}
      <SectionCard title="Recommended Portfolio Allocation" description={`Optimal traffic split for ${selectedSegment.name} × ${FRAMEWORK_VERTICALS[selectedVertical].name} × ${LIFECYCLE_STAGES[selectedLifecycle].label}`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Primary", model: allocation.primary, pct: allocation.primaryPct, color: "#2563eb" },
            { label: "Secondary", model: allocation.secondary, pct: allocation.secondaryPct, color: "#16a34a" },
            { label: "Exploration", model: allocation.explorationModel, pct: allocation.explorationPct, color: "#ea580c" },
          ].map(slot => (
            <div key={slot.label} style={{ background: `${slot.color}08`, border: `1px solid ${slot.color}30`, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: slot.color, textTransform: "uppercase", marginBottom: 4 }}>{slot.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{slot.pct}%</div>
              <div style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{slot.model.name}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Composite: {slot.model.composite.toFixed(3)}</div>
            </div>
          ))}
        </div>

        {/* Allocation bar */}
        <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ width: `${allocation.primaryPct}%`, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{allocation.primary.name.split(" ")[0]} {allocation.primaryPct}%</span>
          </div>
          <div style={{ width: `${allocation.secondaryPct}%`, background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{allocation.secondaryPct}%</span>
          </div>
          <div style={{ width: `${allocation.explorationPct}%`, background: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{allocation.explorationPct}%</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          Score gap between primary and secondary: <strong>{allocation.scoreGap.toFixed(3)}</strong>
          {allocation.scoreGap < 0.05 ? " — Close competition, larger secondary allocation warranted" : allocation.scoreGap < 0.10 ? " — Moderate gap, balanced allocation" : " — Clear winner, focused primary allocation"}
        </div>
      </SectionCard>

      {/* Multi-Objective Radar + Scores Table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="Multi-Objective Model Comparison" description="Radar chart showing how each model scores across four strategic objectives">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="model" style={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} style={{ fontSize: 10 }} />
              <Radar name="Revenue" dataKey="Revenue" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
              <Radar name="Experience" dataKey="Experience" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} />
              <Radar name="Adv. Health" dataKey="Adv. Health" stroke="#ea580c" fill="#ea580c" fillOpacity={0.15} />
              <Radar name="Compute" dataKey="Compute" stroke="#9333ea" fill="#9333ea" fillOpacity={0.15} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Detailed Scores" description="Objective-level breakdown for all candidate models">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#374151" }}>Model</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#2563eb" }}>Revenue</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#16a34a" }}>Experience</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#ea580c" }}>Health</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#9333ea" }}>Compute</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Composite</th>
              </tr>
            </thead>
            <tbody>
              {allocation.scores.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6", background: i === 0 ? "#eff6ff" : "transparent" }}>
                  <td style={{ padding: "6px 8px", fontWeight: i === 0 ? 600 : 400 }}>{s.name}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{(s.revenueScore * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{(s.experienceScore * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{(s.healthScore * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{(s.computeScore * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>{(s.composite * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
            Weights: Rev {(FRAMEWORK_VERTICALS[selectedVertical].weights.revenue * 100).toFixed(0)}% · Exp {(FRAMEWORK_VERTICALS[selectedVertical].weights.experience * 100).toFixed(0)}% · Health {(FRAMEWORK_VERTICALS[selectedVertical].weights.health * 100).toFixed(0)}% · Compute {(FRAMEWORK_VERTICALS[selectedVertical].weights.compute * 100).toFixed(0)}%
          </div>
        </SectionCard>
      </div>

      {/* Cross-vertical + Cross-lifecycle comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SectionCard title="Cross-Vertical Strategy" description="How the recommended primary model changes by vertical">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={crossVerticalData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 0.8]} style={{ fontSize: 10 }} />
              <YAxis dataKey="vertical" type="category" width={90} style={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v) => v.toFixed(3)} />
              <Bar dataKey="composite" fill="#2563eb" radius={[0, 4, 4, 0]}>
                {crossVerticalData.map((_, i) => <Cell key={i} fill={["#2563eb", "#7c3aed", "#16a34a", "#ea580c", "#0891b2", "#e11d48"][i % 6]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>
            {crossVerticalData.map(d => (
              <div key={d.vertical} style={{ fontSize: 11, color: "#374151", padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                <span>{d.vertical}</span>
                <span style={{ fontWeight: 600 }}>{d.primary}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Lifecycle Impact" description="How lifecycle stage affects exploration allocation and model selection">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={crossLifecycleData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="lifecycle" style={{ fontSize: 10 }} />
              <YAxis style={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="explorationPct" fill="#ea580c" name="Exploration %" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>
            {crossLifecycleData.map(d => (
              <div key={d.lifecycle} style={{ fontSize: 11, color: "#374151", padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                <span>{d.lifecycle}: {d.primary}</span>
                <span style={{ color: "#ea580c", fontWeight: 600 }}>{d.explorationPct}% exploration</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Strategic Insights */}
      <InsightBox title="Key Insight: Model Selection Is Contextual" content={`No single model wins across all contexts. The optimal choice depends on segment data density (${(Math.min(1, selectedSegment.size / 4000000) * 100).toFixed(0)}% for ${selectedSegment.name}), vertical-specific objective weights, and advertiser lifecycle stage. For ${FRAMEWORK_VERTICALS[selectedVertical].name}, ${selectedVertical === "finance" ? "user experience weight (35%) drives preference toward precise, low-latency models like GBDT" : selectedVertical === "gaming" ? "revenue weight (40%) with high ad load tolerance favors models with strong engagement prediction" : selectedVertical === "local_services" ? "advertiser health weight (30%) — highest of any vertical — prioritizes cold-start performance for SMB advertisers" : "the balance of revenue and experience objectives determines the optimal portfolio split"}.`} />
      <InsightBox title="Systems Insight: Portfolio Hedging Reduces Risk" content={`Allocating ${allocation.secondaryPct}% to ${allocation.secondary.name} provides insurance against primary model degradation and enables continuous A/B comparison. ${selectedLifecycle === "new" ? "For new advertisers, the " + allocation.explorationPct + "% exploration budget accelerates learning and reduces churn risk (currently " + (LIFECYCLE_STAGES[selectedLifecycle].churnRisk * 100) + "%)." : selectedLifecycle === "declining" ? "For declining advertisers, re-engagement exploration at " + allocation.explorationPct + "% combats " + (LIFECYCLE_STAGES[selectedLifecycle].churnRisk * 100) + "% churn risk." : "Portfolio diversification across " + allocation.scores.length + " models maintains system resilience."}`} type="success" />
    </div>
  );
}

export default function App() {
  const advertisers = useMemo(() => generateAdvertisers(80, 42), []);
  const [tab, setTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "pacing", label: "Budget Pacing" },
    { id: "feedback", label: "Quality Feedback" },
    { id: "exploration", label: "Explore vs Exploit" },
    { id: "cascade", label: "Cascade Ranking" },
    { id: "ecosystem", label: "Ecosystem Impact" },
    { id: "adtypes", label: "Ad Types VCG" },
    { id: "ranking", label: "Ads Ranking" },
    { id: "strategy", label: "Model Strategy" },
    { id: "scenario", label: "Finance Scenario" },
    { id: "segments", label: "Segments" },
    { id: "whatif", label: "What-If Chat" },
  ];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px 32px" }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Ad Auction Simulator</h1>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>
            VCG Engine · Ad Types VCG · Budget Pacing · Quality Feedback · Thompson Sampling · Cascade Ranking · Ads Ranking · Model Strategy · Finance Scenario · LLM What-If
          </p>
        </div>
        <TabBar tabs={tabs} active={tab} onChange={setTab} />
        {tab === "dashboard" && <AuctionDashboard advertisers={advertisers} />}
        {tab === "pacing" && <BudgetPacingTab advertisers={advertisers} />}
        {tab === "feedback" && <QualityFeedbackTab advertisers={advertisers} />}
        {tab === "exploration" && <ExplorationTab />}
        {tab === "cascade" && <CascadeRankingTab advertisers={advertisers} />}
        {tab === "ecosystem" && <EcosystemImpactTab advertisers={advertisers} />}
        {tab === "adtypes" && <AdTypesVCGTab advertisers={advertisers} />}
        {tab === "ranking" && <AdsRankingTab advertisers={advertisers} />}
        {tab === "strategy" && <ModelStrategyTab />}
        {tab === "scenario" && <FinanceScenarioTab />}
        {tab === "segments" && <SegmentExplorer />}
        {tab === "whatif" && <WhatIfChat advertisers={advertisers} />}
      </div>
    </div>
  );
}
