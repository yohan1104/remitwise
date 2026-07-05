<div align="center">

# 💸 RemitWise

### Send More. Save Smarter. Live Better.

**Every remittance, a step toward financial security — enforced on-chain.**

RemitWise turns every incoming USDC payment into automatic savings, real
progress on your goals, and AI-powered guidance. The savings rule isn't a
backend promise — it's a **deployed Soroban smart contract** on Stellar.

_Stellar Hackathon MVP — real on-chain settlement, demo-ready end-to-end._

</div>

---

## ✨ What makes it different

Most remittance apps just move money. RemitWise makes every transfer build wealth,
and does it **trustlessly on Stellar**:

1. **You log in** and get a real Stellar wallet (funded + USDC trustline).
2. **A USDC remittance arrives** (a real testnet payment; simulated for the demo).
3. **The Soroban vault contract enforces the split** — retains your savings
   share on-chain and releases the rest to your wallet, atomically.
4. **Savings goals advance automatically**, and the dashboard updates live.
5. **AI generates personalized, actionable insights** from your real numbers.

Every remittance produces a **real transaction hash you can open on
stellar.expert**. The saved USDC is held by the contract, not a database row.

---

## ⭐ On-chain architecture (the important part)

```
 Treasury (issuer + distributor)                 Soroban Savings Vault
 ────────────────────────────────                ─────────────────────────────
 issues USDC (SAC token) ──────────► deposit_remittance(from, user, amount)
                                       ├─ pulls `amount` USDC from treasury
                                       ├─ retains `amount × rate` as savings  ⟶ held on-chain
                                       └─ releases the remainder ─────────────⟶ user's wallet
 user ──► set_rate / withdraw / deposit_savings   (all require the user's signature)
```

- **`contracts/savings-vault`** — a real Rust/Soroban contract. It holds a
  per-user savings balance, a configurable auto-save rate (basis points), and
  moves USDC via the token interface. Unit-tested (`npm run contract:test`).
- **USDC** is a first-class Stellar asset with a deployed **Stellar Asset
  Contract (SAC)**, so the vault moves real value.
- **The savings rule is contract-enforced** — the backend cannot bypass it.
- The exact same `receiveRemittance` service is called by the demo "simulate"
  endpoint and would be called by a production **Horizon payment-stream
  webhook** — no app changes needed to go live.

Contract methods: `deposit_remittance`, `deposit_savings`, `withdraw`,
`set_rate`, `savings_of`, `rate_of`, `total_savings`.

---

## 🧱 Tech stack

| Layer | Choice |
|-------|--------|
| Blockchain | **Stellar** · **Soroban smart contract (Rust)** · USDC SAC · Testnet |
| SDKs | `@stellar/stellar-sdk` (Horizon + Soroban RPC) · `stellar-cli` |
| Framework | **Next.js 15** (App Router) · React 19 · TypeScript |
| Styling | **Tailwind CSS v4** · custom shadcn/ui · Framer Motion |
| Charts | Recharts |
| Data | **Prisma** · SQLite (dev) → PostgreSQL/Supabase (prod) |
| Auth & security | JWT (jose) + bcrypt · **AES-256-GCM encryption** of wallet secrets |
| AI | Provider-agnostic (OpenAI-compatible) with deterministic, actionable fallback |

---

## 🚀 Quick start

Prereqs: **Node 20+**, and for the contract, **Rust + `stellar-cli`** with the
`wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`).

```bash
# 1. Install dependencies
npm install

# 2. Create the local database
npm run db:push

# 3. Build + deploy the Soroban vault and USDC asset to testnet
npm run contract:build       # compiles the Rust contract to wasm
npm run stellar:bootstrap    # deploys vault + USDC SAC, writes stellar.config.json

# 4. Seed a fully on-chain demo account
npm run db:seed              # provisions a wallet + runs real remittances

# 5. Run
npm run dev
```

Open **http://localhost:3000** → sign in with:

```
Email:    demo@remitwise.app
Password: demo1234
```

> The demo account is genuinely backed by on-chain state — its dashboard USDC
> balance equals its real Stellar balance, and its savings live in the vault
> contract. Register a fresh account to watch a wallet get provisioned live.

### Reset
```bash
npm run db:reset             # wipe DB + reseed (reuses the deployed contract)
```

---

## 🔑 Environment variables

Copy `.env.example` → `.env`. Sensible dev defaults; the Stellar infra is read
from the generated `stellar.config.json` (or env vars in production — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | `file:./dev.db` (SQLite) or a Postgres URL |
| `AUTH_SECRET` | ✅ (prod) | Signs session JWTs. App refuses insecure default in prod. |
| `WALLET_ENCRYPTION_KEY` | – | Encrypts wallet secrets at rest. Falls back to `AUTH_SECRET`. |
| `AI_API_KEY` | – | Optional OpenAI-compatible key; blank = deterministic insights |

---

## 📁 Project structure

```
contracts/savings-vault/     ⭐ Soroban smart contract (Rust) + tests
scripts/
  bootstrap-stellar.ts       one-time infra deploy (vault + USDC SAC)
  stellar-smoke.ts           classic asset/payment de-risk
  soroban-e2e.ts             full pipeline de-risk
src/
  app/                       routes: (auth), dashboard, api/*
  components/
    brand/ ui/ marketing/ auth/ dashboard/
  lib/
    stellar/
      chain.ts               low-level Horizon + Soroban helpers
      soroban.ts             app-facing on-chain ops (deposit/withdraw/rate)
      config.ts              loads deployed contract/treasury config
      service.ts             wallet provisioning + encrypted keys
    savings/engine.ts        ⭐ settles remittances on-chain via the vault
    dashboard/service.ts     analytics + financial health
    ai/service.ts            insights (provider + actionable mock)
    crypto.ts / crypto-core.ts   AES-256-GCM for secrets at rest
prisma/  schema.prisma · seed.ts (on-chain demo seeder)
```

---

## 🔒 Security notes

- **Wallet secrets are encrypted at rest** (AES-256-GCM), never plaintext.
- **No insecure default in production** — the app throws if `AUTH_SECRET` is unset.
- Custodial testnet keys exist only for the demo; the documented production path
  is **non-custodial signing** (Freighter/WalletConnect), which removes secret
  storage entirely. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 📖 More docs

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Vercel + Supabase + contract config
- **[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)** — 3–5 minute presentation script
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — beyond the MVP

---

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run contract:build` | Compile the Soroban contract to wasm |
| `npm run contract:test` | Run the contract's Rust unit tests |
| `npm run stellar:bootstrap` | Deploy vault + USDC asset, write config (`--force` to redeploy) |
| `npm run db:push` / `db:seed` / `db:reset` | Database |

---

<div align="center">
Built for the Stellar Hackathon · <strong>Send More. Save Smarter. Live Better.</strong>
</div>
