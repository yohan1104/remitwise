# Deployment Guide — Vercel + Supabase

RemitWise runs on SQLite locally with zero setup. For a hosted demo, deploy the
frontend/API to **Vercel** and the database to **Supabase Postgres**. The only
code change required is the Prisma datasource provider.

---

## 1. Switch Prisma to PostgreSQL

In `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was: "sqlite"
  url      = env("DATABASE_URL")
}
```

The models are already Postgres-compatible — no other schema changes needed.

---

## 2. Create a Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string → URI**.
3. Copy the connection string. Use the **connection pooler** URL (port `6543`)
   for the app runtime, and the direct URL (port `5432`) for migrations.

Prisma with a pooler needs both:

```env
DATABASE_URL="postgresql://postgres:[PWD]@[HOST]:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PWD]@[HOST]:5432/postgres"
```

Add `directUrl` to the datasource:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Push the schema and (optionally) seed:

```bash
npx prisma db push
npm run db:seed   # optional demo data
```

---

## 3. Deploy to Vercel

1. Push the repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add environment variables (Project → Settings → Environment Variables):

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Supabase pooler URI |
   | `DIRECT_URL` | Supabase direct URI |
   | `AUTH_SECRET` | 32+ byte random hex string |
   | `STELLAR_NETWORK` | `testnet` |
   | `AI_API_KEY` | _(optional)_ your OpenAI-compatible key |
   | `AI_API_BASE_URL` | _(optional)_ provider base URL |
   | `AI_MODEL` | _(optional)_ model id |

4. **Build command:** `prisma generate && next build`
   (or keep the default — `postinstall` already runs `prisma generate`).
5. Deploy. 🎉

> **Note:** `prisma generate` must run during the Vercel build so the client
> matches the deployed platform. The included `postinstall` script handles this
> automatically; if your CI blocks install scripts, set the build command above.

---

## 4. Stellar / Soroban configuration in production

Locally, `npm run stellar:bootstrap` deploys the vault + USDC SAC and writes
`stellar.config.json` (gitignored, contains testnet secrets). For a hosted
deploy, run bootstrap once, then move those values into Vercel env vars so no
secret file ships:

| Key | From `stellar.config.json` |
|-----|----------------------------|
| `STELLAR_VAULT_CONTRACT_ID` | `vaultContractId` |
| `STELLAR_SAC_CONTRACT_ID` | `sacContractId` |
| `STELLAR_USDC_ISSUER` | `usdc.issuer` |
| `STELLAR_DISTRIBUTOR_PUBLIC` / `STELLAR_DISTRIBUTOR_SECRET` | `distributor.*` |
| `STELLAR_HORIZON_URL` / `STELLAR_SOROBAN_RPC_URL` / `STELLAR_NETWORK_PASSPHRASE` | as generated |

`src/lib/stellar/config.ts` prefers env vars over the file automatically.

## 5. Production hardening checklist

The MVP is demo-optimized. Already addressed vs. the original review:

- [x] **Real on-chain settlement** — a deployed Soroban vault enforces the split.
- [x] **Wallet secrets encrypted at rest** (AES-256-GCM), no plaintext.
- [x] **No insecure auth default in production** (fails fast if `AUTH_SECRET` unset).

Still recommended before real users:

- [ ] **Non-custodial signing** (Freighter / WalletConnect) so users hold their
      own keys — removes wallet-secret storage entirely. `lib/stellar` is the
      integration point; distributor key would move to a KMS/HSM.
- [ ] Swap the JWT auth for **Clerk** or **Supabase Auth** (`lib/auth`).
- [ ] Replace the "simulate remittance" endpoint with a **Horizon payment
      stream / webhook** that calls the same `receiveRemittance()`.
- [ ] Add rate limiting on API routes and CSRF protection.
- [ ] Move money math to integer minor units / `Decimal` (currently rounded to
      USDC's 7 decimals).
- [ ] Use production USDC (Circle) with proper trustline + compliance flows.
