const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'YC';
pres.title = 'Ad Auction Simulator Dashboard';

// Color palette
const colors = {
  primary: "2563EB",      // Blue
  secondary: "7C3AED",    // Purple
  success: "16A34A",      // Green
  warning: "EA580C",      // Orange
  dark: "111827",         // Dark gray
  lightText: "6B7280",    // Light gray
  bg: "F8FAFC",          // Off-white
  white: "FFFFFF",
  card: "F9FAFB"
};

// Helper function to create metric card
function addMetricCard(slide, x, y, label, value, subtext, color) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 2.0, h: 1.2,
    fill: { color: colors.white },
    line: { color: "E5E7EB", width: 1 }
  });

  slide.addText(label, {
    x: x + 0.15, y: y + 0.1, w: 1.7, h: 0.3,
    fontSize: 11, color: colors.lightText, bold: true,
    fontFace: "Arial", align: "left"
  });

  slide.addText(value, {
    x: x + 0.15, y: y + 0.4, w: 1.7, h: 0.45,
    fontSize: 28, color: colors.dark, bold: true,
    fontFace: "Arial"
  });

  if (subtext) {
    slide.addText(subtext, {
      x: x + 0.15, y: y + 0.85, w: 1.7, h: 0.25,
      fontSize: 10, color: colors.lightText, italic: true,
      fontFace: "Arial"
    });
  }
}

// Helper function to create bar chart
function addBarChart(slide, x, y, w, h, title) {
  slide.addText(title, {
    x, y, w, h: 0.35,
    fontSize: 13, bold: true, color: colors.dark,
    fontFace: "Arial"
  });

  const chartY = y + 0.4;
  const segments = [
    { name: "Y.T.", gsp: 0.38, vcg: 0.29 },
    { name: "S.P.", gsp: 0.42, vcg: 0.35 },
    { name: "L.S.", gsp: 0.15, vcg: 0.09 },
    { name: "C.S.", gsp: 0.41, vcg: 0.32 },
    { name: "B.P.", gsp: 0.32, vcg: 0.28 },
    { name: "F.E.", gsp: 0.28, vcg: 0.24 },
    { name: "G.", gsp: 0.44, vcg: 0.36 },
    { name: "A.R.", gsp: 0.18, vcg: 0.11 }
  ];

  const barWidth = w / (segments.length * 2.3);
  const maxHeight = h - 0.6;

  segments.forEach((seg, i) => {
    const startX = x + (i * 1.15);

    // GSP bar
    slide.addShape(pres.shapes.RECTANGLE, {
      x: startX, y: chartY + maxHeight - (seg.gsp * maxHeight),
      w: barWidth, h: seg.gsp * maxHeight,
      fill: { color: colors.primary }, line: { type: "none" }
    });

    // VCG bar
    slide.addShape(pres.shapes.RECTANGLE, {
      x: startX + barWidth + 0.05, y: chartY + maxHeight - (seg.vcg * maxHeight),
      w: barWidth, h: seg.vcg * maxHeight,
      fill: { color: colors.secondary }, line: { type: "none" }
    });

    // Label
    slide.addText(seg.name, {
      x: startX, y: chartY + maxHeight + 0.1, w: barWidth * 2 + 0.05, h: 0.25,
      fontSize: 9, color: colors.lightText, align: "center",
      fontFace: "Arial"
    });
  });

  // Legend
  slide.addShape(pres.shapes.RECTANGLE, {
    x: x, y: y + h - 0.35, w: 0.15, h: 0.15,
    fill: { color: colors.primary }, line: { type: "none" }
  });
  slide.addText("GSP", {
    x: x + 0.2, y: y + h - 0.35, w: 0.6, h: 0.15,
    fontSize: 10, color: colors.dark, fontFace: "Arial", valign: "middle"
  });

  slide.addShape(pres.shapes.RECTANGLE, {
    x: x + 1.0, y: y + h - 0.35, w: 0.15, h: 0.15,
    fill: { color: colors.secondary }, line: { type: "none" }
  });
  slide.addText("VCG", {
    x: x + 1.25, y: y + h - 0.35, w: 0.6, h: 0.15,
    fontSize: 10, color: colors.dark, fontFace: "Arial", valign: "middle"
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 1: Title Slide
// ═══════════════════════════════════════════════════════════════════════════════
let slide1 = pres.addSlide();
slide1.background = { color: colors.primary };

slide1.addText("Ad Auction Simulator", {
  x: 0.5, y: 1.5, w: 9, h: 1,
  fontSize: 54, bold: true, color: colors.white,
  fontFace: "Arial", align: "center"
});

slide1.addText("GSP/VCG Auction Engine · Recommender Model Routing · LLM-Powered Analysis", {
  x: 0.5, y: 2.6, w: 9, h: 0.6,
  fontSize: 18, color: colors.white, align: "center",
  fontFace: "Arial"
});

slide1.addText("Interactive Dashboard Demo", {
  x: 0.5, y: 4.0, w: 9, h: 0.5,
  fontSize: 16, color: colors.white, italic: true, align: "center",
  fontFace: "Arial"
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 2: Dashboard - Auction Overview
// ═══════════════════════════════════════════════════════════════════════════════
let slide2 = pres.addSlide();
slide2.background = { color: colors.bg };

// Header
slide2.addText("Auction Dashboard", {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.dark,
  fontFace: "Arial"
});

// Tabs
const tabs = ["Auction Dashboard", "Segment Explorer", "What-If Analysis"];
tabs.forEach((tab, i) => {
  const isActive = i === 0;
  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 0.5 + (i * 2.5), y: 0.85, w: 2.3, h: 0.35,
    fill: { color: isActive ? colors.white : "transparent" },
    line: { color: isActive ? colors.primary : "E5E7EB", width: 1 }
  });
  slide2.addText(tab, {
    x: 0.5 + (i * 2.5), y: 0.85, w: 2.3, h: 0.35,
    fontSize: 11, bold: isActive, color: isActive ? colors.primary : colors.lightText,
    align: "center", valign: "middle", fontFace: "Arial"
  });
});

// Metric Cards Row 1
addMetricCard(slide2, 0.5, 1.4, "Total Revenue", "$2,847.32", "Per 1K impr.", colors.primary);
addMetricCard(slide2, 2.6, 1.4, "Avg RPM", "$4.87", "Rev per 1K impr", colors.success);
addMetricCard(slide2, 4.7, 1.4, "Total Clicks", "14,287", "Across segments", colors.warning);
addMetricCard(slide2, 6.8, 1.4, "Advertisers", "80", "8 verticals", colors.secondary);

// Chart: Revenue by Segment
addBarChart(slide2, 0.5, 2.8, 4.5, 2.3, "Revenue by Segment: GSP vs VCG");

// Table: Auction Winners
slide2.addText("Auction Winners — Young Tech Enthusiasts", {
  x: 5.2, y: 2.8, w: 4.3, h: 0.3,
  fontSize: 12, bold: true, color: colors.dark,
  fontFace: "Arial"
});

const tableData = [
  ["🥇", "Advertiser", "Vertical", "Bid", "Quality", "CPC"],
  ["1", "Finance Adv. 23", "Finance", "$9.54", "0.891", "$6.21"],
  ["2", "E-Comm Adv. 5", "E-Commerce", "$7.82", "0.764", "$3.89"],
  ["3", "SaaS Adv. 12", "SaaS", "$6.45", "0.701", "$2.45"],
  ["4", "Gaming Adv. 8", "Gaming", "$5.12", "0.623", "$1.87"]
];

tableData.forEach((row, i) => {
  const rowY = 3.15 + (i * 0.33);
  const rowBg = i === 0 ? colors.white : (i % 2 === 0 ? colors.card : colors.white);

  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: rowY, w: 4.3, h: 0.33,
    fill: { color: rowBg }, line: { color: "E5E7EB", width: 0.5 }
  });

  let colX = 5.2;
  const colWidths = [0.4, 1.5, 1.0, 0.6, 0.6, 0.6];

  row.forEach((cell, j) => {
    slide2.addText(cell, {
      x: colX + 0.05, y: rowY, w: colWidths[j] - 0.1, h: 0.33,
      fontSize: 9, color: i === 0 ? colors.dark : colors.dark,
      bold: i === 0, align: j > 2 ? "center" : "left",
      valign: "middle", fontFace: "Arial"
    });
    colX += colWidths[j];
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 3: Reserve Price Analysis
// ═══════════════════════════════════════════════════════════════════════════════
let slide3 = pres.addSlide();
slide3.background = { color: colors.bg };

slide3.addText("Revenue vs Reserve Price Analysis", {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.dark,
  fontFace: "Arial"
});

// Area chart mockup
slide3.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 6.5, h: 3.8,
  fill: { color: colors.white },
  line: { color: "E5E7EB", width: 1 }
});

// Curve path visualization
const curvePoints = [
  { x: 0.7, y: 3.5 },
  { x: 1.5, y: 2.8 },
  { x: 2.3, y: 2.5 },
  { x: 3.1, y: 2.2 },
  { x: 3.9, y: 2.0 },
  { x: 4.7, y: 2.3 },
  { x: 5.5, y: 3.0 }
];

for (let i = 0; i < curvePoints.length - 1; i++) {
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: curvePoints[i].x,
    y: 4.2 - curvePoints[i].y,
    w: curvePoints[i + 1].x - curvePoints[i].x,
    h: 0.05,
    fill: { color: colors.primary },
    line: { type: "none" }
  });
}

// Fill under curve
slide3.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 4.2 - 3.5, w: 4.85, h: 3.5,
  fill: { color: colors.primary, transparency: 80 },
  line: { type: "none" }
});

// Axis labels
slide3.addText("$0    $1    $2    $3    $4", {
  x: 0.7, y: 4.5, w: 4.85, h: 0.25,
  fontSize: 10, color: colors.lightText, align: "left",
  fontFace: "Arial"
});

// Optimal point marker
slide3.addShape(pres.shapes.OVAL, {
  x: 3.1 - 0.1, y: 4.2 - 2.2 - 0.1, w: 0.2, h: 0.2,
  fill: { color: colors.warning }, line: { color: colors.dark, width: 1 }
});

slide3.addText("OPTIMAL\n$2.00 → $3,421", {
  x: 2.5, y: 3.5, w: 1.5, h: 0.6,
  fontSize: 10, bold: true, color: colors.warning,
  align: "center", fontFace: "Arial"
});

// Key Insights
slide3.addText("Key Insights", {
  x: 7.2, y: 1.0, w: 2.3, h: 0.3,
  fontSize: 14, bold: true, color: colors.dark,
  fontFace: "Arial"
});

const insights = [
  "Sweet spot: $2.00",
  "Max revenue: $3,421",
  "Fill rate: 58%",
  "vs $0.50: +20% rev",
  "vs $5.00: -44% rev"
];

insights.forEach((insight, i) => {
  slide3.addText("• " + insight, {
    x: 7.2, y: 1.4 + (i * 0.35), w: 2.3, h: 0.3,
    fontSize: 10, color: colors.dark,
    fontFace: "Arial"
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 4: Segment Explorer
// ═══════════════════════════════════════════════════════════════════════════════
let slide4 = pres.addSlide();
slide4.background = { color: colors.bg };

slide4.addText("Segment Explorer & Model Routing", {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.dark,
  fontFace: "Arial"
});

// Segment buttons
const segments = ["Young Tech", "Suburban P.", "Luxury", "College", "Biz Prof.", "Fitness", "Gamers", "Retirees"];
let btnX = 0.5;
segments.forEach((seg, i) => {
  if (i === 0) {
    slide4.addShape(pres.shapes.RECTANGLE, {
      x: btnX, y: 1.0, w: 1.08, h: 0.3,
      fill: { color: colors.primary },
      line: { color: colors.primary, width: 1 }
    });
    slide4.addText(seg, {
      x: btnX, y: 1.0, w: 1.08, h: 0.3,
      fontSize: 9, bold: true, color: colors.white, align: "center",
      valign: "middle", fontFace: "Arial"
    });
  } else {
    slide4.addShape(pres.shapes.RECTANGLE, {
      x: btnX, y: 1.0, w: 1.08, h: 0.3,
      fill: { color: colors.white },
      line: { color: "D1D5DB", width: 0.5 }
    });
    slide4.addText(seg, {
      x: btnX, y: 1.0, w: 1.08, h: 0.3,
      fontSize: 9, color: colors.lightText, align: "center",
      valign: "middle", fontFace: "Arial"
    });
  }
  btnX += 1.12;
});

// Segment info cards
addMetricCard(slide4, 0.5, 1.5, "Segment Size", "2.4M", "", colors.primary);
addMetricCard(slide4, 2.6, 1.5, "Avg CTR", "4.2%", "", colors.success);
addMetricCard(slide4, 4.7, 1.5, "Avg CVR", "1.8%", "", colors.warning);
addMetricCard(slide4, 6.8, 1.5, "Best Model", "DLRM", "", colors.secondary);

// Model Comparison Table
slide4.addText("Model Performance Comparison", {
  x: 0.5, y: 2.95, w: 6.0, h: 0.3,
  fontSize: 12, bold: true, color: colors.dark,
  fontFace: "Arial"
});

const modelData = [
  ["Model", "CTR Lift", "Rev Lift", "Latency"],
  ["Two-Tower", "0.785", "0.746", "5ms"],
  ["GBDT", "0.812", "0.633", "12ms"],
  ["DLRM", "0.860", "0.731", "24ms"],
  ["Bandit", "0.755", "0.619", "8ms"]
];

modelData.forEach((row, i) => {
  const rowY = 3.35 + (i * 0.32);
  const rowBg = i === 0 ? colors.white : (i === 3 ? colors.primary : colors.white);

  slide4.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: rowY, w: 6.0, h: 0.32,
    fill: { color: rowBg }, line: { color: "E5E7EB", width: 0.5 }
  });

  const colWidths = [2.0, 1.5, 1.5, 1.0];
  let colX = 0.5;
  row.forEach((cell, j) => {
    slide4.addText(cell, {
      x: colX + 0.05, y: rowY, w: colWidths[j] - 0.1, h: 0.32,
      fontSize: 9, color: i === 0 || i === 3 ? colors.white : colors.dark,
      bold: i === 0 || i === 3, align: "center",
      valign: "middle", fontFace: "Arial"
    });
    colX += colWidths[j];
  });
});

// Recommendation badge
slide4.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 4.95, w: 6.0, h: 0.5,
  fill: { color: colors.primary, transparency: 10 },
  line: { color: colors.primary, width: 1 }
});

slide4.addText("✓ RECOMMENDED: DLRM Deep Model — Warm segment with high data density. Revenue lift 0.731 justifies compute cost.", {
  x: 0.65, y: 4.98, w: 5.7, h: 0.44,
  fontSize: 10, color: colors.dark, bold: true,
  fontFace: "Arial", valign: "middle"
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 5: What-If Chat Interface
// ═══════════════════════════════════════════════════════════════════════════════
let slide5 = pres.addSlide();
slide5.background = { color: colors.bg };

slide5.addText("What-If Analysis Chat", {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.dark,
  fontFace: "Arial"
});

// Chat box
slide5.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 3.8,
  fill: { color: colors.white },
  line: { color: "E5E7EB", width: 1 }
});

// Assistant message
slide5.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 1.15, w: 8.6, h: 0.8,
  fill: { color: colors.card },
  line: { type: "none" }
});

slide5.addText("Welcome to the What-If Analyzer. I can run simulations and analyze the impact on revenue, advertiser surplus, and segment performance.", {
  x: 0.9, y: 1.2, w: 8.2, h: 0.7,
  fontSize: 10, color: colors.dark, italic: true,
  fontFace: "Arial", valign: "top"
});

// User message
slide5.addShape(pres.shapes.RECTANGLE, {
  x: 3.5, y: 2.15, w: 5.8, h: 0.65,
  fill: { color: colors.primary, transparency: 10 },
  line: { color: colors.primary, width: 0.5 }
});

slide5.addText("What if we raise reserve prices to $2.50?", {
  x: 3.7, y: 2.2, w: 5.4, h: 0.55,
  fontSize: 10, color: colors.dark, bold: true,
  fontFace: "Arial", valign: "middle"
});

// Response message
slide5.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 2.95, w: 8.6, h: 1.65,
  fill: { color: colors.card },
  line: { type: "none" }
});

const responseText = [
  { text: "Reserve Price Impact Analysis", options: { bold: true, breakLine: true } },
  { text: "\n", options: { breakLine: true } },
  { text: "Revenue: $2,847 → $3,156 (+10.8%)", options: { breakLine: true } },
  { text: "\n", options: { breakLine: true } },
  { text: "Higher reserve prices filter low-quality bids, increasing average CPC. Watch for fill rate degradation in smaller segments.", options: { fontSize: 9 } }
];

slide5.addText(responseText, {
  x: 0.9, y: 3.0, w: 8.2, h: 1.55,
  fontSize: 10, color: colors.dark,
  fontFace: "Arial", valign: "top"
});

// Input field
slide5.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 5.0, w: 8.5, h: 0.4,
  fill: { color: colors.white },
  line: { color: "D1D5DB", width: 1 }
});

slide5.addText("Ask a what-if question about the auction system...", {
  x: 0.7, y: 5.05, w: 8.1, h: 0.3,
  fontSize: 11, color: colors.lightText, italic: true,
  fontFace: "Arial", valign: "middle"
});

// Send button
slide5.addShape(pres.shapes.RECTANGLE, {
  x: 9.1, y: 5.0, w: 0.4, h: 0.4,
  fill: { color: colors.primary },
  line: { type: "none" }
});

slide5.addText("→", {
  x: 9.1, y: 5.0, w: 0.4, h: 0.4,
  fontSize: 16, bold: true, color: colors.white, align: "center",
  valign: "middle", fontFace: "Arial"
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 6: Key Features
// ═══════════════════════════════════════════════════════════════════════════════
let slide6 = pres.addSlide();
slide6.background = { color: colors.bg };

slide6.addText("Key Features & Capabilities", {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.dark,
  fontFace: "Arial"
});

const features = [
  { icon: "📊", title: "Auction Engine", desc: "GSP & VCG mechanisms with quality-weighted bids" },
  { icon: "🔄", title: "Model Routing", desc: "4 recommender models with segment-aware routing" },
  { icon: "💬", title: "What-If Analysis", desc: "Claude-powered natural language queries" },
  { icon: "📈", title: "Interactive Charts", desc: "Real-time revenue, RPM, and performance metrics" },
  { icon: "🎯", title: "Sensitivity Analysis", desc: "Reserve price, quality floor, and model impact" },
  { icon: "🏆", title: "Simulation Data", desc: "80 synthetic advertisers across 8 verticals" }
];

let featureY = 1.2;
features.forEach((feat, i) => {
  if (i === 3) {
    featureY = 1.2;
  }

  const colX = i < 3 ? 0.5 : 5.3;
  const rowY = featureY + (i % 3) * 1.15;

  slide6.addShape(pres.shapes.RECTANGLE, {
    x: colX, y: rowY, w: 0.45, h: 0.45,
    fill: { color: colors.primary, transparency: 20 },
    line: { type: "none" }
  });

  slide6.addText(feat.icon, {
    x: colX, y: rowY, w: 0.45, h: 0.45,
    fontSize: 22, align: "center", valign: "middle",
    fontFace: "Arial"
  });

  slide6.addText(feat.title, {
    x: colX + 0.55, y: rowY, w: 4.2, h: 0.25,
    fontSize: 12, bold: true, color: colors.dark,
    fontFace: "Arial"
  });

  slide6.addText(feat.desc, {
    x: colX + 0.55, y: rowY + 0.25, w: 4.2, h: 0.2,
    fontSize: 10, color: colors.lightText,
    fontFace: "Arial"
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 7: Closing
// ═══════════════════════════════════════════════════════════════════════════════
let slide7 = pres.addSlide();
slide7.background = { color: colors.secondary };

slide7.addText("Ready to Explore?", {
  x: 0.5, y: 1.8, w: 9, h: 0.7,
  fontSize: 44, bold: true, color: colors.white,
  fontFace: "Arial", align: "center"
});

slide7.addText("Run the dashboard locally and start experimenting with auction dynamics", {
  x: 0.5, y: 2.6, w: 9, h: 0.5,
  fontSize: 16, color: colors.white, align: "center",
  fontFace: "Arial"
});

slide7.addText([
  { text: "Backend: ", options: { bold: true, breakLine: true } },
  { text: "uvicorn app.main:app --reload --port 8000", options: { fontFace: "monospace", fontSize: 10, breakLine: true } },
  { text: "\nFrontend: ", options: { bold: true, breakLine: true } },
  { text: "npm run dev (http://localhost:3000)", options: { fontFace: "monospace", fontSize: 10 } }
], {
  x: 1.5, y: 3.5, w: 7, h: 1.2,
  fontSize: 11, color: colors.white, align: "center",
  fontFace: "Arial"
});

// Write presentation
pres.writeFile({ fileName: "Ad_Auction_Simulator_Dashboard.pptx" });
console.log("✓ Presentation created: Ad_Auction_Simulator_Dashboard.pptx");
