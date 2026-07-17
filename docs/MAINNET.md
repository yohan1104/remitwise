# Mainnet Deployment Guide

Testnet → production checklist. Work through it in order; every item is a
hard gate unless marked optional. The application code is network-agnostic —
going live is configuration plus operational hardening, not a code change.

## 1. Prerequisites (blockers)

- [ ] Third-party audit of `contracts/savings-vault` completed, findings closed
      (internal audit: `docs/SECURITY_AUDIT.md`).
- [ ] Signed agreement with a licensed SEP-24 anchor covering your corridors
      (PH payout at minimum). You need their home domain and asset support for
      Circle USDC.
- [ ] Legal/compliance sign-off for the corridors you operate (money-service
      licensing varies by jurisdiction; the anchor carries KYC/AML inside its
      interactive flow, you carry platform obligations).
- [ ] Key management: treasury secret in a KMS/HSM (never a raw env var), and
      `WALLET_ENCRYPTION_KEY` distinct from `AUTH_SECRET`, both rotated into a
      secrets manager.

## 2. On-chain deployment

1. Fund a deployer + treasury (distributor) account with XLM for reserves/fees.
2. Build the contract: `npm run contract:build`.
3. Deploy **with constructor-style init in one step** (closes audit finding
   C-4 — never leave a deployed-but-uninitialized contract on mainnet):

   ```sh
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/savings_vault.wasm \
     --source-account DEPLOYER --network mainnet \
     -- initialize \
     --admin  <TREASURY_PUBLIC> \
     --token  <USDC_SAC_CONTRACT_ID> \
     --default_rate_bps 2000
   ```

4. The token address MUST be the SAC of Circle USDC
   (`USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). Derive it
   with `assetContractId()` from `src/lib/stellar/assets.ts` or
   `stellar contract asset id --asset USDC:GA5ZSE…`.
5. Establish the treasury's USDC trustline and fund it via your anchor
   (fiat → USDC deposit to the treasury account).

## 3. Environment

Set these (Vercel + worker host). The app **fails fast** if a mainnet value
is inconsistent (non-Circle issuer, missing secrets).

| Variable | Mainnet value |
|---|---|
| `STELLAR_NETWORK` | `public` |
| `STELLAR_HORIZON_URL` | `https://horizon.stellar.org` |
| `STELLAR_SOROBAN_RPC_URL` | your RPC provider (SDF public RPC is not for production) |
| `STELLAR_NETWORK_PASSPHRASE` | `Public Global Stellar Network ; September 2015` |
| `STELLAR_USDC_CODE` / `STELLAR_USDC_ISSUER` | `USDC` / `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| `STELLAR_SAC_CONTRACT_ID` | Circle USDC SAC id |
| `STELLAR_VAULT_CONTRACT_ID` | from step 2 |
| `STELLAR_DISTRIBUTOR_PUBLIC` / `_SECRET` | treasury (secret via KMS reference) |
| `ANCHOR_PROVIDER` | `sep24` |
| `ANCHOR_HOME_DOMAIN` | your anchor's domain |
| `PAYMENT_WEBHOOK_SECRET` | 32+ random bytes, shared only with the worker |
| `AUTH_SECRET`, `WALLET_ENCRYPTION_KEY` | distinct 32+ byte secrets |
| `DATABASE_URL` / `DIRECT_URL` | production Postgres (pooled / direct) |

Notes:
- `ALLOW_UNKNOWN_ASSET` must be **unset** in production.
- Friendbot funding and the `simulate` endpoint are testnet-only conveniences;
  provisioning on mainnet is fully sponsored by the treasury (already the
  default path) — budget ~1.5 XLM of sponsored reserves per user (fee-bump
  fees are negligible).

## 4. Workers

Run `npm run payments:listen` as a supervised process (systemd/Fly/Railway,
restart-always). It is safe to restart at any time: the Horizon cursor is
persisted in `SystemState` and replayed payments are deduped by tx hash.
Run exactly one instance per treasury account.

## 5. Operational readiness

- [ ] Rate limiting backed by Redis (`lib/rate-limit.ts` is pluggable; the
      in-memory store is per-instance and resets on deploy).
- [ ] Error tracking (Sentry) + uptime checks on `/api/dashboard` and the
      worker's log stream.
- [ ] Alerting on: ingest failures, `withdrawal.failed` audit events, Horizon
      stream reconnect loops, treasury XLM/USDC balance thresholds.
- [ ] Database backups + PITR enabled; `AuditLog` retained ≥ 5 years.
- [ ] Runbook: contract `upgrade` procedure (build → hash → admin-signed
      invoke), anchor incident contacts, treasury key rotation.

## 6. Launch sequence

1. Deploy app with mainnet env to a staging URL; run one end-to-end cent-sized
   remittance → auto-save → goal → withdrawal against the live anchor.
2. Verify explorer links, FX oracle (Reflector mainnet feed carries PHP —
   quotes switch from "reference" to "live oracle" automatically).
3. Flip production DNS. Monitor the first 48h with the alerting above.
