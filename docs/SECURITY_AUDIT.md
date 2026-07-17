# RemitWise Security Audit — Phase 2

Internal audit of the Soroban savings-vault contract and the platform's
financial paths, performed as the mainnet-readiness gate. Each finding lists
its resolution; anything deferred is tracked with an explicit rationale.

**Scope:** `contracts/savings-vault`, wallet/key handling, payment ingest,
ramp engines, API surface. **Date:** 2026-07. **Status:** all HIGH findings
resolved in code; third-party audit remains a mainnet prerequisite.

---

## Part 1 — Soroban contract (`savings-vault`)

### Findings & resolutions

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| C-1 | **HIGH** | **State archival (rent) not handled.** Persistent entries (`Savings`, `Rate`) and instance storage had no TTL management. On mainnet, entries whose TTL lapses are archived — a user's savings balance would become unreachable until manually restored, reading as "funds gone". | **Fixed.** Every state-mutating path extends TTLs (`extend_ttl`, 30-day threshold → 120-day horizon) on the touched persistent keys and the instance. Regular activity keeps state live indefinitely; a dormant account's entries can still be restored losslessly via `RestoreFootprint`. |
| C-2 | **HIGH** | **No upgrade path.** A bug discovered post-deployment (with real balances in the vault) would have been unrecoverable — no way to patch without asking every user to migrate funds to a new contract. | **Fixed.** `upgrade(new_wasm_hash)` (admin-gated, `require_auth`) swaps the WASM in place via `update_current_contract_wasm`; storage (balances, rates, token binding) survives. This is the incident-response path. |
| C-3 | MEDIUM | **Admin key stored but powerless.** `DataKey::Admin` was written at initialize and never used — no governance surface at all, so the default rate baked at deployment was permanent. | **Fixed.** `set_default_rate` (admin-gated, cap-checked, evented) and `admin()` view added. Per-user overrides always win over the default. |
| C-4 | MEDIUM | **Initialization front-running.** `initialize` is permissionless; on a public chain an attacker could initialize a freshly deployed contract before the deployer, seizing admin. | **Mitigated / deferred.** Deploy + initialize run in immediate succession from `stellar:bootstrap`, and a hijacked instance is detectable before any funds move (admin mismatch) — redeploy costs pennies. For mainnet the deploy script MUST pass constructor args at deploy time (single-transaction deploy+init, no window). Tracked in `docs/MAINNET.md`. |
| C-5 | LOW | **`set_rate` emitted no event** while every money movement did — an off-chain indexer could not reconstruct rate history. | **Fixed.** `rate` and `defrate` events added. |
| C-6 | INFO | **Arithmetic overflow.** `i128` totals could theoretically overflow. | **Verified safe.** `overflow-checks = true` in the release profile (panics, never wraps), and USDC supply (< 2^46 stroops) is 24 orders of magnitude below `i128::MAX`. |
| C-7 | INFO | **Re-entrancy.** Token `transfer` is a cross-contract call made mid-function. | **Verified safe.** Soroban prohibits re-entrant calls by design; state is additionally settled before the outbound transfer in `withdraw` (checks-effects-interactions held anyway). |
| C-8 | INFO | **Third-party deposits.** `deposit_savings(from, user, …)` lets anyone fund another user's savings from their own tokens. | **Intended.** This is the family-top-up path; the payer authorizes, funds can only ever be withdrawn by `user`. Documented. |

### Auth model (verified)

- `deposit_remittance` / `deposit_savings` — payer (`from`) must sign: they fund the transfer.
- `withdraw` / `set_rate` — the owner must sign; savings can never be moved by the platform.
- `set_default_rate` / `upgrade` — admin must sign.
- Views are unauthenticated (public chain state).

Test suite: 13 tests covering the split math, overrides, overdraw rejection,
zero/cap validation, double-init rejection, default-rate governance, and
multi-user totals (`npm run contract:test`).

---

## Part 2 — Platform

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| P-1 | **HIGH** | **Mainnet asset spoofing.** The app trusted whatever `USDC` code/issuer was configured; a misconfigured mainnet deployment could settle a worthless look-alike asset. | **Fixed.** `lib/stellar/assets.ts` pins Circle's issuers per network; the app **refuses to start** on mainnet with an unknown issuer (`ALLOW_UNKNOWN_ASSET=1` is the explicit, logged escape hatch). Payment listener now verifies code **and** issuer. |
| P-2 | **HIGH** | **Off-ramp could strand funds.** A payment to an anchor settlement account lacking a trustline would bounce mid-withdrawal. | **Fixed.** `verifyTrustline` gates every withdrawal: existence, authorization, and headroom are checked before the user's USDC moves. |
| P-3 | MEDIUM | **Listener lost its place.** The Horizon stream started at `cursor("now")`; any payment arriving while the worker was down was silently missed. | **Fixed.** Cursor persisted to `SystemState` per processed record; restarts resume from the stored cursor and Horizon replays the gap (at-least-once; ingest is idempotent on tx hash). Supervised reconnect with exponential backoff (1s→60s). |
| P-4 | MEDIUM | **Ramp race conditions.** Concurrent status polls / duplicate sender clicks could double-settle a deposit or double-complete a withdrawal. | **Fixed by construction.** All lifecycle transitions are optimistic-concurrency claims (`updateMany where status = previous`); losers re-read instead of re-applying. Deposit settlement additionally reuses the ingest idempotency. |
| P-5 | MEDIUM | **Account numbers in cleartext responses.** | **Fixed.** Full numbers are stored server-side for the anchor payout but every API/view exposes only `•••• 1234`; audit entries record the masked form. |
| P-6 | LOW | **Quote drift.** Client-side estimates could diverge from execution. | **Fixed.** Quotes are computed server-side with integer-stroop arithmetic and snapshotted onto the row at confirmation; the UI labels pre-confirmation numbers "estimate" and FX honestly (`live oracle` vs `reference`). |
| P-7 | INFO | Custodial key risk (encrypted-at-rest secrets). | **Architecture landed, migration deferred.** All new signing flows go through the `lib/stellar/signing.ts` custody seam; see `docs/ARCHITECTURE.md § Custody model` for the Freighter migration path. KMS-backed encryption is the mainnet requirement. |

## Mainnet blockers (unchanged by this audit)

1. Third-party contract audit of `savings-vault`.
2. Constructor-based deploy+initialize (C-4).
3. KMS/HSM custody for treasury + user keys, or completed non-custodial migration (P-7).
4. Real SEP-24 anchor agreement (`ANCHOR_PROVIDER=sep24`) — the mock is demo-only.

Full go-live procedure: `docs/MAINNET.md`.
