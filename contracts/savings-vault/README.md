# RemitWise Savings Vault — Soroban Contract

The on-chain heart of RemitWise. This contract enforces the auto-savings rule so
it can't be bypassed by any backend: when a remittance arrives, it retains the
user's configured savings share and releases the rest — atomically.

## Interface

| Method | Auth | Description |
|--------|------|-------------|
| `initialize(admin, token, default_rate_bps)` | once | Set the USDC token (SAC) and default rate |
| `deposit_remittance(from, user, amount) -> (saved, available)` | `from` | Pull USDC, retain `amount × rate` as savings, release the rest to `user` |
| `deposit_savings(from, user, amount)` | `from` | Move funds 100% into savings (manual top-up) |
| `withdraw(user, amount)` | `user` | Release savings back to the user |
| `set_rate(user, rate_bps)` | `user` | Personal auto-save rate (basis points, ≤ 9000) |
| `savings_of(user) -> i128` | view | User's savings balance held by the vault |
| `rate_of(user) -> u32` | view | Effective rate (override or default) |
| `total_savings() -> i128` | view | Total savings custodied by the vault |

Value moves in a real Stellar asset (USDC) through its Stellar Asset Contract
(SAC) token interface. Amounts are `i128` in the asset's smallest unit (7 decimals).

## Develop

```bash
cargo test                 # unit tests (5)
stellar contract build     # -> target/wasm32v1-none/release/savings_vault.wasm
```

Deploy + wire it up from the repo root with `npm run stellar:bootstrap`.
