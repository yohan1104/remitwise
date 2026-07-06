/* RemitWise pitch deck generator — 11 slides, dark premium brand theme. */
const pptxgen = require("pptxgenjs");
const React = require("react");
const RD = require("react-dom/server");
const sharp = require("sharp");
const Fa = require("react-icons/fa");

// ---- palette ----
const BG = "0B1B3F";
const BG2 = "0A1836";
const CARD = "13244E";
const CARD2 = "172C57";
const BLUE = "2563EB";
const BLUE_LT = "3B82F6";
const TEAL = "22D3EE";
const CYAN = "38BDF8";
const GREEN = "34D399";
const AMBER = "FBBF24";
const WHITE = "FFFFFF";
const ICE = "D6E4FF";
const MUTED = "93A7CC";
const LINE = "24386A";
const W = 13.333, H = 7.5;

const shadow = () => ({ type: "outer", color: "000000", blur: 9, offset: 3, angle: 90, opacity: 0.28 });

async function icon(Comp, color, size = 256) {
  const svg = RD.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

async function main() {
  const I = {};
  const need = {
    bolt: Fa.FaBolt, lock: Fa.FaLock, chart: Fa.FaChartLine, piggy: Fa.FaPiggyBank,
    check: Fa.FaCheckCircle, robot: Fa.FaRobot, globe: Fa.FaGlobe, shield: Fa.FaShieldAlt,
    coins: Fa.FaCoins, users: Fa.FaUsers, target: Fa.FaBullseye, arrow: Fa.FaArrowRight,
    contract: Fa.FaFileContract, wallet: Fa.FaWallet, money: Fa.FaMoneyBillWave, hand: Fa.FaHandHoldingUsd,
    ban: Fa.FaBan, clock: Fa.FaClock, rocket: Fa.FaRocket, link: Fa.FaExternalLinkAlt, code: Fa.FaCode,
    eye: Fa.FaEye, star: Fa.FaStar, seedling: Fa.FaSeedling,
  };
  for (const [k, C] of Object.entries(need)) {
    I[k] = { w: await icon(C, WHITE), teal: await icon(C, TEAL), blue: await icon(C, BLUE_LT), green: await icon(C, GREEN), navy: await icon(C, BG) };
  }

  const p = new pptxgen();
  p.defineLayout({ name: "W", width: W, height: H });
  p.layout = "W";
  p.author = "RemitWise";
  p.title = "RemitWise — Pitch Deck";

  const slide = () => { const s = p.addSlide(); s.background = { color: BG }; return s; };

  // wordmark top-left
  const mark = (s, x = 0.6, y = 0.42, sz = 15) =>
    s.addText([{ text: "Remit", options: { color: WHITE } }, { text: "Wise", options: { color: TEAL } }],
      { x, y, w: 3, h: 0.4, fontFace: "Arial", fontSize: sz, bold: true, charSpacing: 1, margin: 0 });

  const kicker = (s, text, x = 0.6, y = 0.95) =>
    s.addText(text.toUpperCase(), { x, y, w: 8, h: 0.35, fontFace: "Arial", fontSize: 13, bold: true, color: TEAL, charSpacing: 3, margin: 0 });

  const title = (s, text, x = 0.6, y = 1.35, w = 12.1, sz = 34) =>
    s.addText(text, { x, y, w, h: 1.0, fontFace: "Arial", fontSize: sz, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.0 });

  const iconCircle = (s, x, y, d, fill, iconData) => {
    s.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill } });
    const ip = d * 0.5;
    s.addImage({ data: iconData, x: x + (d - ip) / 2, y: y + (d - ip) / 2, w: ip, h: ip });
  };

  const card = (s, x, y, w, h, fill = CARD) =>
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, shadow: shadow() });

  const page = (s, n) => s.addText(String(n).padStart(2, "0"), { x: W - 1.0, y: H - 0.55, w: 0.6, h: 0.3, align: "right", fontFace: "Arial", fontSize: 10, color: MUTED, margin: 0 });

  // ============ SLIDE 1 — TITLE ============
  {
    const s = slide();
    // ambient dots
    s.addShape(p.shapes.OVAL, { x: -1.2, y: -1.6, w: 5, h: 5, fill: { color: BLUE, transparency: 82 } });
    s.addShape(p.shapes.OVAL, { x: 10.4, y: 4.6, w: 4.4, h: 4.4, fill: { color: TEAL, transparency: 86 } });
    // brand badge
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: W / 2 - 0.5, y: 1.35, w: 1.0, h: 1.0, rectRadius: 0.22, fill: { color: BLUE }, shadow: shadow() });
    s.addText("R", { x: W / 2 - 0.5, y: 1.35, w: 1.0, h: 1.0, align: "center", valign: "middle", fontFace: "Arial", fontSize: 44, bold: true, color: WHITE, margin: 0 });
    s.addText([{ text: "Remit", options: { color: WHITE } }, { text: "Wise", options: { color: TEAL } }],
      { x: 1.66, y: 2.7, w: 10, h: 1.1, align: "center", fontFace: "Arial", fontSize: 60, bold: true, charSpacing: 1, margin: 0 });
    s.addText("SEND MORE.  SAVE SMARTER.  LIVE BETTER.",
      { x: 1.66, y: 3.9, w: 10, h: 0.4, align: "center", fontFace: "Arial", fontSize: 15, bold: true, color: CYAN, charSpacing: 3, margin: 0 });
    s.addText("Automatic, on-chain savings for every remittance — enforced by a deployed Soroban smart contract on Stellar.",
      { x: 2.66, y: 4.45, w: 8, h: 0.8, align: "center", fontFace: "Arial", fontSize: 16, color: ICE, margin: 0 });
    // proof chip
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: W / 2 - 2.9, y: 5.6, w: 5.8, h: 0.62, rectRadius: 0.31, fill: { color: CARD2 }, line: { color: LINE, width: 1 } });
    s.addImage({ data: I.bolt.teal, x: W / 2 - 2.55, y: 5.74, w: 0.34, h: 0.34 });
    s.addText("Live on Stellar Testnet  ·  Deployed Soroban vault  ·  Real USDC settlement",
      { x: W / 2 - 2.1, y: 5.6, w: 5.2, h: 0.62, valign: "middle", fontFace: "Arial", fontSize: 12.5, bold: true, color: WHITE, margin: 0 });
    s.addNotes("Open confident: RemitWise turns every remittance into savings — and the savings rule is a REAL deployed Soroban contract, not a backend promise. We'll show you the live product and the on-chain proof. Replace this line with your live Vercel URL when presenting.");
  }

  // ============ SLIDE 2 — PROBLEM ============
  {
    const s = slide(); mark(s); kicker(s, "The Problem"); title(s, "Money moves. Futures don't.");
    // left big stat
    card(s, 0.6, 2.5, 5.4, 4.2, CARD);
    s.addText("~0%", { x: 0.9, y: 3.0, w: 4.8, h: 1.3, fontFace: "Arial", fontSize: 72, bold: true, color: TEAL, margin: 0 });
    s.addText("of remittance income is automatically saved today.",
      { x: 0.9, y: 4.35, w: 4.8, h: 0.9, fontFace: "Arial", fontSize: 18, color: WHITE, margin: 0 });
    s.addText("Hundreds of billions of dollars arrive every year — and are spent within days.",
      { x: 0.9, y: 5.4, w: 4.8, h: 1.0, fontFace: "Arial", fontSize: 13.5, color: MUTED, margin: 0 });
    // right three pains
    const pains = [
      [I.clock.teal, "Spent before saved", "Most income is gone in days — nothing set aside for emergencies or goals."],
      [I.ban.teal, "No enforcement", "Savings apps rely on soft promises; nothing stops funds being withdrawn."],
      [I.eye.teal, "No visibility or guidance", "Recipients get no clear progress and no advice on what to do next."],
    ];
    let y = 2.5;
    for (const [ic, h, b] of pains) {
      card(s, 6.35, y, 6.35, 1.32, CARD);
      iconCircle(s, 6.62, y + 0.32, 0.68, "12305F", ic);
      s.addText(h, { x: 7.5, y: y + 0.2, w: 5.0, h: 0.4, fontFace: "Arial", fontSize: 16, bold: true, color: WHITE, margin: 0 });
      s.addText(b, { x: 7.5, y: y + 0.6, w: 5.05, h: 0.66, fontFace: "Arial", fontSize: 12.5, color: MUTED, margin: 0 });
      y += 1.44;
    }
    page(s, 2);
    s.addNotes("Make it human: picture a mother receiving money monthly from a child abroad. It keeps the family afloat — but a year later there's still no safety net. The problem isn't income, it's that nothing turns income into savings.");
  }

  // ============ SLIDE 3 — SOLUTION / THE LOOP ============
  {
    const s = slide(); mark(s); kicker(s, "The Solution"); title(s, "Every remittance auto-saves itself — on-chain.");
    const steps = [
      [I.wallet.w, "Receive", "USDC arrives in a real Stellar wallet"],
      [I.contract.w, "Vault splits", "Soroban contract enforces the rule"],
      [I.piggy.w, "20% saved", "80% released as spendable"],
      [I.target.w, "Goals advance", "Dashboard updates live"],
      [I.robot.w, "AI coaches", "Actionable, on-chain insights"],
    ];
    const cw = 2.28, gap = 0.28, startX = 0.6, cy = 2.65, ch = 2.5;
    steps.forEach((st, i) => {
      const x = startX + i * (cw + gap);
      card(s, x, cy, cw, ch, i === 1 ? CARD2 : CARD);
      iconCircle(s, x + cw / 2 - 0.34, cy + 0.28, 0.68, i === 1 ? BLUE : "12305F", st[0]);
      s.addText(String(i + 1), { x: x + 0.16, y: cy + 0.16, w: 0.4, h: 0.3, fontFace: "Arial", fontSize: 12, bold: true, color: TEAL, margin: 0 });
      s.addText(st[1], { x: x + 0.12, y: cy + 1.08, w: cw - 0.24, h: 0.4, align: "center", fontFace: "Arial", fontSize: 15, bold: true, color: WHITE, margin: 0 });
      s.addText(st[2], { x: x + 0.14, y: cy + 1.5, w: cw - 0.28, h: 0.85, align: "center", fontFace: "Arial", fontSize: 11.5, color: MUTED, margin: 0 });
      if (i < steps.length - 1) s.addImage({ data: I.arrow.teal, x: x + cw + gap / 2 - 0.11, y: cy + ch / 2 - 0.11, w: 0.22, h: 0.22 });
    });
    // stat chips
    const chips = [["USDC", "settlement asset"], ["20%", "default auto-save"], ["~5 sec", "on-chain settle"]];
    chips.forEach((c, i) => {
      const x = 0.6 + i * 4.15;
      card(s, x, 5.55, 3.9, 1.15, CARD);
      s.addText(c[0], { x: x + 0.3, y: 5.7, w: 3.3, h: 0.6, fontFace: "Arial", fontSize: 30, bold: true, color: TEAL, margin: 0 });
      s.addText(c[1], { x: x + 0.32, y: 6.28, w: 3.3, h: 0.35, fontFace: "Arial", fontSize: 13, color: MUTED, margin: 0 });
    });
    page(s, 3);
    s.addNotes("This whole loop happens automatically, every time money arrives. Emphasize step 2 — the split is enforced by a smart contract, not our server.");
  }

  // ============ SLIDE 4 — LIVE DEMO ============
  {
    const s = slide(); mark(s); kicker(s, "Live Demo"); title(s, "See it work — a real $500 remittance.");
    // mock A: dashboard KPIs
    card(s, 0.6, 2.55, 4.0, 4.1, CARD);
    s.addText("Dashboard", { x: 0.85, y: 2.75, w: 3.5, h: 0.35, fontFace: "Arial", fontSize: 13, bold: true, color: MUTED, margin: 0 });
    const kpis = [["Total received", "$2,230", TEAL], ["Available", "$1,784", CYAN], ["Savings (vault)", "$446", GREEN], ["Auto-save rate", "20%", BLUE_LT]];
    let ky = 3.2;
    kpis.forEach(k => {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: ky, w: 3.5, h: 0.72, rectRadius: 0.08, fill: { color: CARD2 } });
      s.addText(k[0], { x: 1.05, y: ky + 0.1, w: 2.2, h: 0.5, valign: "middle", fontFace: "Arial", fontSize: 12, color: MUTED, margin: 0 });
      s.addText(k[1], { x: 2.5, y: ky + 0.1, w: 1.75, h: 0.5, valign: "middle", align: "right", fontFace: "Arial", fontSize: 18, bold: true, color: k[2], margin: 0 });
      ky += 0.84;
    });
    // mock B: incoming split
    card(s, 4.75, 2.55, 3.85, 4.1, CARD);
    s.addText("Incoming remittance", { x: 5.0, y: 2.75, w: 3.3, h: 0.35, fontFace: "Arial", fontSize: 13, bold: true, color: MUTED, margin: 0 });
    s.addText("$500.00", { x: 5.0, y: 3.1, w: 3.3, h: 0.7, fontFace: "Arial", fontSize: 34, bold: true, color: WHITE, margin: 0 });
    s.addText("from Maria Santos · USDC", { x: 5.0, y: 3.8, w: 3.3, h: 0.3, fontFace: "Arial", fontSize: 11.5, color: MUTED, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 5.0, y: 4.35, w: 3.35, h: 0.85, rectRadius: 0.08, fill: { color: "10331F" } });
    s.addImage({ data: I.piggy.green, x: 5.2, y: 4.62, w: 0.34, h: 0.34 });
    s.addText("Auto-saved (20%)", { x: 5.65, y: 4.42, w: 1.8, h: 0.7, valign: "middle", fontFace: "Arial", fontSize: 12, color: ICE, margin: 0 });
    s.addText("$100", { x: 7.0, y: 4.42, w: 1.2, h: 0.7, valign: "middle", align: "right", fontFace: "Arial", fontSize: 18, bold: true, color: GREEN, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 5.0, y: 5.3, w: 3.35, h: 0.85, rectRadius: 0.08, fill: { color: "13284F" } });
    s.addImage({ data: I.wallet.blue, x: 5.2, y: 5.57, w: 0.34, h: 0.34 });
    s.addText("Available", { x: 5.65, y: 5.37, w: 1.8, h: 0.7, valign: "middle", fontFace: "Arial", fontSize: 12, color: ICE, margin: 0 });
    s.addText("$400", { x: 7.0, y: 5.37, w: 1.2, h: 0.7, valign: "middle", align: "right", fontFace: "Arial", fontSize: 18, bold: true, color: CYAN, margin: 0 });
    // mock C: settled success
    card(s, 8.75, 2.55, 3.95, 4.1, CARD);
    iconCircle(s, 10.5, 2.85, 0.85, "10331F", I.check.green);
    s.addText("Settled on-chain", { x: 8.95, y: 3.85, w: 3.55, h: 0.4, align: "center", fontFace: "Arial", fontSize: 18, bold: true, color: WHITE, margin: 0 });
    s.addText("Split enforced by the Soroban vault — one atomic transaction.",
      { x: 9.1, y: 4.3, w: 3.25, h: 0.7, align: "center", fontFace: "Arial", fontSize: 12.5, color: MUTED, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 9.0, y: 5.0, w: 3.45, h: 1.45, rectRadius: 0.08, fill: { color: CARD2 } });
    s.addText("GOALS ADVANCED", { x: 9.2, y: 5.12, w: 3.1, h: 0.3, fontFace: "Arial", fontSize: 10.5, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
    s.addText([
      { text: "Emergency Fund   +$30.77", options: { breakLine: true } },
      { text: "Education        +$46.15", options: { breakLine: true } },
      { text: "Medical          +$23.08", options: {} },
    ], { x: 9.2, y: 5.5, w: 3.1, h: 0.85, fontFace: "Courier New", fontSize: 11, color: ICE, margin: 0, paraSpaceAfter: 3 });
    page(s, 4);
    s.addNotes("This is the actual product. Do it live if you can: log in, click Simulate Remittance $500, and show the split land. These are faithful recreations of the real screens.");
  }

  // ============ SLIDE 5 — ON-CHAIN PROOF ============
  {
    const s = slide(); mark(s); kicker(s, "On-chain proof"); title(s, "Not trusted — verified.");
    // architecture: 3 nodes
    const nodes = [
      [I.coins.w, "Treasury", "Sends USDC", BLUE],
      [I.contract.w, "Soroban Vault", "Retains 20% · releases 80%", TEAL],
      [I.wallet.w, "User wallet", "Receives spendable USDC", CYAN],
    ];
    const nw = 3.5, ny = 2.55, nh = 2.0, sx = 0.7, gp = 0.55;
    nodes.forEach((n, i) => {
      const x = sx + i * (nw + gp);
      card(s, x, ny, nw, nh, i === 1 ? CARD2 : CARD);
      iconCircle(s, x + 0.3, ny + 0.62, 0.78, i === 1 ? BLUE : "12305F", n[0]);
      s.addText(n[1], { x: x + 1.25, y: ny + 0.55, w: nw - 1.4, h: 0.45, fontFace: "Arial", fontSize: 17, bold: true, color: WHITE, margin: 0 });
      s.addText(n[2], { x: x + 1.25, y: ny + 1.02, w: nw - 1.4, h: 0.7, fontFace: "Arial", fontSize: 12, color: MUTED, margin: 0 });
      if (i < 2) s.addImage({ data: I.arrow.teal, x: x + nw + gp / 2 - 0.15, y: ny + nh / 2 - 0.15, w: 0.3, h: 0.3 });
    });
    // proof strip
    card(s, 0.7, 5.05, 11.6, 1.65, CARD);
    s.addText("VERIFY IT YOURSELF — STELLAR TESTNET", { x: 1.0, y: 5.2, w: 8, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: TEAL, charSpacing: 2, margin: 0 });
    const proofs = [
      ["Savings Vault contract", "CBYWNM…DJH5G"],
      ["Live remittance tx", "77fccd7f…b33dd7ef"],
      ["USDC asset issuer", "GBQXWF5B…AFW2K"],
    ];
    proofs.forEach((pr, i) => {
      const x = 1.0 + i * 3.8;
      s.addText(pr[0], { x, y: 5.6, w: 3.6, h: 0.3, fontFace: "Arial", fontSize: 12, color: MUTED, margin: 0 });
      s.addImage({ data: I.link.teal, x, y: 6.02, w: 0.24, h: 0.24 });
      s.addText(pr[1], { x: x + 0.34, y: 5.95, w: 3.3, h: 0.4, fontFace: "Courier New", fontSize: 14, bold: true, color: WHITE, margin: 0 });
    });
    s.addText("stellar.expert / explorer / testnet", { x: 1.0, y: 6.4, w: 8, h: 0.25, fontFace: "Arial", fontSize: 10.5, italic: true, color: MUTED, margin: 0 });
    page(s, 5);
    s.addNotes("This is the slide that wins it. The savings rule is a deployed contract with a real, clickable transaction — our backend physically cannot bypass it. Offer judges the explorer link.");
  }

  // ============ SLIDE 6 — WHY DIFFERENT (comparison) ============
  {
    const s = slide(); mark(s); kicker(s, "Why it's different"); title(s, "Built to be verified, not just trusted.");
    const hdr = (t, c) => ({ text: t, options: { fill: { color: CARD2 }, color: c, bold: true, align: "center", valign: "middle", fontSize: 14 } });
    const cell = (t, c = ICE, b = false) => ({ text: t, options: { color: c, align: "center", valign: "middle", fontSize: 13, bold: b, fill: { color: CARD } } });
    const feat = (t) => ({ text: t, options: { color: WHITE, bold: true, align: "left", valign: "middle", fontSize: 13, fill: { color: CARD } } });
    const rwHdr = { text: "RemitWise", options: { fill: { color: BLUE }, color: WHITE, bold: true, align: "center", valign: "middle", fontSize: 15 } };
    const rw = (t) => ({ text: t, options: { color: TEAL, bold: true, align: "center", valign: "middle", fontSize: 13, fill: { color: "102A57" } } });
    const rows = [
      [hdr("", MUTED), hdr("Traditional remittance", MUTED), hdr("Savings app", MUTED), rwHdr],
      [feat("Auto-saves income"), cell("No", MUTED), cell("Soft rule"), rw("Contract-enforced")],
      [feat("On-chain proof"), cell("No", MUTED), cell("No", MUTED), rw("Verifiable tx")],
      [feat("Settlement"), cell("Days + fees"), cell("—", MUTED), rw("Seconds, cents")],
      [feat("Guidance"), cell("None", MUTED), cell("Generic"), rw("AI, actionable")],
    ];
    s.addTable(rows, { x: 0.7, y: 2.55, w: 11.93, colW: [3.2, 3.0, 2.73, 3.0], rowH: [0.7, 0.72, 0.72, 0.72, 0.72], border: { pt: 1, color: BG }, align: "center", valign: "middle" });
    s.addText("The wedge: enforcement + proof. Anyone can promise savings — we make them impossible to skip and easy to verify.",
      { x: 0.7, y: 6.35, w: 11.9, h: 0.5, fontFace: "Arial", fontSize: 13.5, italic: true, color: ICE, margin: 0 });
    page(s, 6);
    s.addNotes("Land the one-liner at the bottom: enforcement plus proof is the moat. Incumbents can copy the UI, not the trustless guarantee.");
  }

  // ============ SLIDE 7 — AI COACH ============
  {
    const s = slide(); mark(s); kicker(s, "AI Financial Coach"); title(s, "A coach that acts — not just talks.");
    // left points
    const pts = [
      [I.chart.teal, "Reads your real data", "Insights from your actual savings, goals and pace."],
      [I.bolt.teal, "Recommends the next move", "Specific, personalized — not generic tips."],
      [I.check.teal, "Acts on-chain in one tap", "Buttons that change your savings rate via the contract."],
    ];
    let y = 2.65;
    for (const [ic, h, b] of pts) {
      iconCircle(s, 0.7, y, 0.66, "12305F", ic);
      s.addText(h, { x: 1.55, y: y - 0.02, w: 4.7, h: 0.4, fontFace: "Arial", fontSize: 17, bold: true, color: WHITE, margin: 0 });
      s.addText(b, { x: 1.55, y: y + 0.4, w: 4.8, h: 0.7, fontFace: "Arial", fontSize: 13, color: MUTED, margin: 0 });
      y += 1.3;
    }
    // right mock insight card
    card(s, 6.7, 2.55, 6.0, 4.15, CARD);
    iconCircle(s, 7.0, 2.85, 0.6, BLUE, I.robot.w);
    s.addText("AI Insight", { x: 7.75, y: 2.9, w: 4.5, h: 0.4, fontFace: "Arial", fontSize: 15, bold: true, color: WHITE, margin: 0 });
    s.addText("Save $50 more per $1,000", { x: 7.0, y: 3.7, w: 5.4, h: 0.45, fontFace: "Arial", fontSize: 18, bold: true, color: TEAL, margin: 0 });
    s.addText("You're auto-saving 20%. Raising it to 25% would fully fund your Emergency Fund about 3 remittances sooner — most people never feel a 5% nudge.",
      { x: 7.0, y: 4.2, w: 5.45, h: 1.1, fontFace: "Arial", fontSize: 13.5, color: ICE, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 7.0, y: 5.5, w: 3.1, h: 0.62, rectRadius: 0.31, fill: { color: BLUE } });
    s.addText("Raise rate to 25%  →", { x: 7.0, y: 5.5, w: 3.1, h: 0.62, align: "center", valign: "middle", fontFace: "Arial", fontSize: 13.5, bold: true, color: WHITE, margin: 0 });
    s.addText("one tap · settles on-chain", { x: 10.25, y: 5.5, w: 2.3, h: 0.62, valign: "middle", fontFace: "Arial", fontSize: 11, italic: true, color: MUTED, margin: 0 });
    page(s, 7);
    s.addNotes("Key point: the AI isn't decoration. Its recommendations are one-tap actions that execute on the contract — guidance that does the thing.");
  }

  // ============ SLIDE 8 — MARKET ============
  {
    const s = slide(); mark(s); kicker(s, "Market opportunity"); title(s, "A massive flow no one saves from.");
    const stats = [
      [I.globe.teal, "$800B+", "global remittances sent every year"],
      [I.target.teal, "$40B", "flows to the Philippines — our beachhead"],
      [I.piggy.teal, "~0%", "auto-directed into savings today"],
    ];
    stats.forEach((st, i) => {
      const x = 0.6 + i * 4.15;
      card(s, x, 2.65, 3.9, 2.9, CARD);
      iconCircle(s, x + 0.35, 2.95, 0.7, "12305F", st[0]);
      s.addText(st[1], { x: x + 0.32, y: 3.75, w: 3.3, h: 0.9, fontFace: "Arial", fontSize: 46, bold: true, color: WHITE, margin: 0 });
      s.addText(st[2], { x: x + 0.34, y: 4.7, w: 3.35, h: 0.75, fontFace: "Arial", fontSize: 13, color: MUTED, margin: 0 });
    });
    card(s, 0.6, 5.85, 12.1, 0.85, CARD2);
    s.addImage({ data: I.star.teal, x: 0.9, y: 6.1, w: 0.34, h: 0.34 });
    s.addText("RemitWise sits where remittances, savings and blockchain rails meet — three fast-growing markets, one product. We start with high-frequency OFW corridors.",
      { x: 1.4, y: 5.85, w: 11.1, h: 0.85, valign: "middle", fontFace: "Arial", fontSize: 13.5, color: ICE, margin: 0 });
    page(s, 8);
    s.addNotes("Numbers are approximate World Bank figures — cite ~$800B global, ~$40B Philippines. The point: enormous inflow, essentially zero of it auto-saved. That's the whitespace.");
  }

  // ============ SLIDE 9 — BUSINESS MODEL ============
  {
    const s = slide(); mark(s); kicker(s, "Business model"); title(s, "We earn when users save more.");
    const cols = [
      [I.money.w, "Settlement spread", "A small margin on FX / on-ramp for each remittance processed."],
      [I.seedling.w, "Yield share", "Pooled savings earn on-chain yield; we share a slice."],
      [I.star.w, "Premium tier", "Higher goals, boosted rates, advanced insights by subscription."],
    ];
    cols.forEach((c, i) => {
      const x = 0.6 + i * 4.15;
      card(s, x, 2.6, 3.9, 3.3, CARD);
      iconCircle(s, x + 0.32, 2.9, 0.8, i === 0 ? BLUE : i === 1 ? "0E6B4E" : "7C4DAB", c[0]);
      s.addText(c[1], { x: x + 0.32, y: 3.85, w: 3.35, h: 0.45, fontFace: "Arial", fontSize: 17, bold: true, color: WHITE, margin: 0 });
      s.addText(c[2], { x: x + 0.32, y: 4.35, w: 3.35, h: 1.3, fontFace: "Arial", fontSize: 13, color: MUTED, margin: 0 });
    });
    card(s, 0.6, 6.15, 12.1, 0.72, CARD2);
    s.addText("Incentive-aligned: our revenue grows with our users' savings — not with fees that shrink what they keep.",
      { x: 0.9, y: 6.15, w: 11.5, h: 0.72, valign: "middle", fontFace: "Arial", fontSize: 13.5, italic: true, color: ICE, margin: 0 });
    page(s, 9);
    s.addNotes("Emphasize alignment: unlike remittance incumbents who profit from fees, we profit when people save. That's a story investors and mission judges both like.");
  }

  // ============ SLIDE 10 — TRACTION & ROADMAP ============
  {
    const s = slide(); mark(s); kicker(s, "Traction & roadmap"); title(s, "Shipped during the hackathon.");
    // left shipped
    card(s, 0.6, 2.6, 6.0, 4.1, CARD);
    s.addText("ALREADY LIVE", { x: 0.9, y: 2.8, w: 5, h: 0.3, fontFace: "Arial", fontSize: 12, bold: true, color: GREEN, charSpacing: 2, margin: 0 });
    const shipped = [
      "Soroban savings vault deployed to testnet",
      "Real USDC settlement — verifiable tx hashes",
      "Working dashboard, goals & AI insights",
      "Wallet secrets encrypted (AES-256-GCM)",
      "Live on Vercel + Supabase",
    ];
    let sy = 3.25;
    for (const t of shipped) {
      s.addImage({ data: I.check.green, x: 0.95, y: sy + 0.02, w: 0.32, h: 0.32 });
      s.addText(t, { x: 1.4, y: sy - 0.03, w: 5.05, h: 0.5, valign: "middle", fontFace: "Arial", fontSize: 14, color: ICE, margin: 0 });
      sy += 0.66;
    }
    // right roadmap
    card(s, 6.9, 2.6, 5.8, 4.1, CARD);
    s.addText("WHAT'S NEXT", { x: 7.2, y: 2.8, w: 5, h: 0.3, fontFace: "Arial", fontSize: 12, bold: true, color: TEAL, charSpacing: 2, margin: 0 });
    const road = [
      ["Live payment detection", "Horizon payment-stream webhook"],
      ["Non-custodial signing", "Freighter / WalletConnect"],
      ["Fiat off-ramp", "Stellar anchor (SEP-24)"],
      ["Philippines pilot", "First real OFW corridor"],
    ];
    let ry = 3.25;
    road.forEach((r, i) => {
      s.addShape(p.shapes.OVAL, { x: 7.2, y: ry + 0.03, w: 0.28, h: 0.28, fill: { color: i === 3 ? TEAL : CARD2 }, line: { color: TEAL, width: 1.5 } });
      if (i < 3) s.addShape(p.shapes.LINE, { x: 7.34, y: ry + 0.31, w: 0, h: 0.52, line: { color: LINE, width: 1.5 } });
      s.addText(r[0], { x: 7.65, y: ry - 0.05, w: 4.9, h: 0.35, fontFace: "Arial", fontSize: 14.5, bold: true, color: WHITE, margin: 0 });
      s.addText(r[1], { x: 7.65, y: ry + 0.3, w: 4.9, h: 0.35, fontFace: "Arial", fontSize: 12, color: MUTED, margin: 0 });
      ry += 0.83;
    });
    page(s, 10);
    s.addNotes("Lead with proof of execution — most hackathon teams show a prototype; we shipped a deployed contract and a live app. Then the roadmap shows we know exactly how to reach production.");
  }

  // ============ SLIDE 11 — TEAM + ASK + CLOSE ============
  {
    const s = slide();
    s.background = { color: BG2 };
    s.addShape(p.shapes.OVAL, { x: 9.6, y: -1.5, w: 5, h: 5, fill: { color: BLUE, transparency: 84 } });
    mark(s); kicker(s, "Team & the ask");
    s.addText("Let's build the savings layer for remittances.", { x: 0.6, y: 1.35, w: 12, h: 0.9, fontFace: "Arial", fontSize: 30, bold: true, color: WHITE, margin: 0 });
    // team
    const team = [["Mychal Pejana", "Co-Founder"], ["Carl Macabales", "Co-Founder"]];
    team.forEach((t, i) => {
      const x = 0.6 + i * 3.15;
      card(s, x, 2.5, 2.95, 1.5, CARD);
      s.addShape(p.shapes.OVAL, { x: x + 0.25, y: 2.75, w: 1.0, h: 1.0, fill: { color: BLUE } });
      s.addText(t[0].split(" ").map(w => w[0]).join(""), { x: x + 0.25, y: 2.75, w: 1.0, h: 1.0, align: "center", valign: "middle", fontFace: "Arial", fontSize: 22, bold: true, color: WHITE, margin: 0 });
      s.addText(t[0], { x: x + 1.35, y: 2.9, w: 1.55, h: 0.4, fontFace: "Arial", fontSize: 15, bold: true, color: WHITE, margin: 0 });
      s.addText(t[1], { x: x + 1.35, y: 3.3, w: 1.55, h: 0.35, fontFace: "Arial", fontSize: 12, color: TEAL, margin: 0 });
    });
    // ask
    card(s, 7.15, 2.5, 5.55, 1.5, CARD2);
    s.addImage({ data: I.rocket.teal, x: 7.45, y: 2.72, w: 0.4, h: 0.4 });
    s.addText("The ask", { x: 7.95, y: 2.68, w: 4.5, h: 0.4, fontFace: "Arial", fontSize: 15, bold: true, color: WHITE, margin: 0 });
    s.addText("SCF support to take RemitWise from testnet to a live Philippines pilot — build-out, mentorship, and first pilot users.",
      { x: 7.45, y: 3.15, w: 5.0, h: 0.8, fontFace: "Arial", fontSize: 12.5, color: ICE, margin: 0 });
    // closing line
    s.addText("Same money. Same senders.", { x: 0.6, y: 4.5, w: 12, h: 0.7, align: "center", fontFace: "Arial", fontSize: 30, bold: true, color: WHITE, margin: 0 });
    s.addText([{ text: "Every peso now builds a future you can ", options: { color: WHITE } }, { text: "verify on-chain.", options: { color: TEAL } }],
      { x: 0.6, y: 5.15, w: 12, h: 0.7, align: "center", fontFace: "Arial", fontSize: 30, bold: true, margin: 0 });
    s.addText("SEND MORE.  SAVE SMARTER.  LIVE BETTER.", { x: 0.6, y: 6.05, w: 12, h: 0.4, align: "center", fontFace: "Arial", fontSize: 13, bold: true, color: CYAN, charSpacing: 3, margin: 0 });
    s.addText("RemitWise · Built for the Stellar Hackathon", { x: 0.6, y: 6.55, w: 12, h: 0.35, align: "center", fontFace: "Arial", fontSize: 11, color: MUTED, margin: 0 });
    s.addNotes("Close with energy on the 'same money, same senders' line. TO EDIT: add your third teammate, correct roles, add GitHub handles, and drop in your live Vercel URL.");
  }

  await p.writeFile({ fileName: "RemitWise_Pitch_Deck_v2.pptx" });
  console.log("✅ wrote RemitWise_Pitch_Deck_v2.pptx");
}
main().catch(e => { console.error(e); process.exit(1); });
