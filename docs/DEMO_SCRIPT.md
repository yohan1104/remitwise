# 🎤 RemitWise — 3–5 Minute Live Demo Script

> Goal: tell **one clear story** — *every remittance becomes a step toward
> financial security* — with a polished, live end-to-end flow.

**Before you start (one-time):** `npm run contract:build && npm run stellar:bootstrap`
to deploy the Soroban vault. Then `npm run db:seed` for a clean, on-chain demo
account, and `npm run dev`. Have the browser at `http://localhost:3000` and a
second tab open to **stellar.expert** (testnet).

---

## ⏱️ 0:00 — The hook (30s)

> "Millions of overseas workers and freelancers receive money every month — but
> most of it gets spent before any of it gets saved. Existing apps just move
> money. **RemitWise turns every remittance into savings and real financial
> progress**, automatically, on Stellar."

**Show:** the landing page. Point at the tagline — *Send More. Save Smarter.
Live Better.* — and the animated "incoming remittance" card splitting into
saved vs. spendable.

---

## ⏱️ 0:30 — Sign in (20s)

- Click **"Try the live demo"** → **Prefill demo credentials** → **Sign in**.

> "I'll log into an account that's already received a few remittances."

**Show:** the dashboard animating in — KPIs counting up, charts drawing.

Call out the four KPIs:
- **Total Remittances**, **Available Balance**, **Savings Balance**, **Savings Rate (20%)**.

---

## ⏱️ 0:50 — The wallet (30s)

**Show:** the **Stellar Wallet** card (scroll to it).

> "Every user gets a real Stellar wallet — here's the address and QR code to
> receive USDC. It's on Stellar Testnet, funded via Friendbot, and you can view
> it live on the block explorer."

- (Optional) Click **Fund testnet** to show live Friendbot funding.

---

## ⏱️ 1:20 — ⭐ The core moment: a real on-chain remittance (75s)

> "Now watch what happens when money comes in — and note this is a **real
> transaction on Stellar**, not a mockup."

- Click **Simulate Remittance** → pick **$500** → **Receive $500**.

**Show:** the settlement stepper — *Broadcasting on Stellar → Soroban vault
enforcing the split → Confirmed on-chain* — then the success screen:
- **$100 auto-saved (20%)**, **$400 available**.
- **Goals advanced** automatically across Emergency Fund, Education, Medical.

> "A Soroban smart contract just retained 20% as savings on-chain and released
> the rest to my wallet — atomically. Our backend couldn't skip that step even
> if it wanted to."

**🔑 The proof beat:** click **"view on Stellar"** next to the tx hash → the
transaction opens on stellar.expert, confirmed, a real contract invocation.

> "There it is on the block explorer. Real USDC, real Soroban contract call."

Click **View my dashboard** → KPIs and charts **update live**.

---

## ⏱️ 2:20 — Goals & progress (40s)

**Show:** the **Savings Goals** section.

> "Each goal fills itself from every transfer. Emergency Fund, Education,
> Medical — all progressing automatically. I can also create a new goal…"

- Click **New goal** → pick a category (e.g. **Vacation**) → **Create goal**.

> "…and top it up manually from my available balance any time."

---

## ⏱️ 3:00 — AI financial insights (40s)

**Show:** the **AI Financial Insights** panel.

> "RemitWise also acts as a financial coach. These insights are generated from
> my real numbers — how much I saved, how close I am to each goal, and a
> forecast of when I'll get there — and they're **actionable**."

- Click an insight's action button, e.g. **"Raise rate to 25%"**.

> "That just updated my auto-save rate **on-chain** via the contract — the
> guidance isn't just text, it does the thing. This runs on any
> OpenAI-compatible model, with a smart fallback so it always works — even offline."

---

## ⏱️ 3:40 — Charts & health (20s)

**Show:** the **Savings over time**, **Spending vs. Savings**, **Goal
Allocation** charts and the **Financial Health** score.

> "A full picture of financial wellbeing — the kind of dashboard you'd expect
> from a funded fintech, not a remittance app."

(Optional: toggle **dark/light mode** to show the polish.)

---

## ⏱️ 4:00 — Close (30s)

> "RemitWise is built on Stellar and USDC, so transfers settle in seconds for
> fractions of a cent. And the savings rule is a **deployed Soroban smart
> contract** — savings are retained on-chain, trustlessly, not by our servers.
>
> Same money. Same senders. But now every peso builds a future you can verify
> on the blockchain. **Send More. Save Smarter. Live Better.** Thank you."

---

### 🧯 Backup tips
- If the network is flaky, the demo still works — Friendbot/Horizon calls are
  best-effort and the savings engine is fully local.
- Reset anytime with `npm run db:reset`.
- Register a fresh account live to prove wallets are created on the fly.
