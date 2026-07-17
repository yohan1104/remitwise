#![no_std]
//! RemitWise Savings Vault
//! -----------------------------------------------------------------------------
//! A Soroban smart contract that enforces RemitWise's core rule ON-CHAIN:
//! when a remittance arrives, a configurable percentage is automatically
//! retained as savings (held by the contract) and the remainder is released to
//! the recipient — atomically, in a single transaction, with no backend trust.
//!
//! Value moves in a real Stellar asset (USDC) via its Stellar Asset Contract
//! (SAC) token interface. Savings are custodied by the contract and can only be
//! released to their owner via `withdraw`, which requires the owner's signature.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN,
    Env,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    DefaultRateBps,
    Rate(Address),    // per-user override, in basis points (2000 = 20%)
    Savings(Address), // per-user savings balance held by the vault
    TotalSavings,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidRate = 3,
    InvalidAmount = 4,
    InsufficientSavings = 5,
}

const MAX_RATE_BPS: u32 = 9000; // cap auto-save at 90%
const BPS_DENOMINATOR: i128 = 10_000;

// --- State-archival (rent) protection ---------------------------------------
// Soroban archives entries whose TTL lapses; an archived Savings entry would
// make a user's funds temporarily unreachable until restored. Every touch of
// user state therefore extends its TTL well beyond the archival horizon.
const DAY_LEDGERS: u32 = 17_280; // ~5s ledgers
const TTL_THRESHOLD: u32 = 30 * DAY_LEDGERS; // extend when < 30 days remain
const TTL_EXTEND_TO: u32 = 120 * DAY_LEDGERS; // …out to 120 days

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    if env.storage().persistent().has(key) {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

#[contract]
pub struct SavingsVault;

#[contractimpl]
impl SavingsVault {
    /// One-time setup. `default_rate_bps` is the fallback auto-save rate.
    pub fn initialize(env: Env, admin: Address, token: Address, default_rate_bps: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error(&env, Error::AlreadyInitialized);
        }
        if default_rate_bps > MAX_RATE_BPS {
            panic_with_error(&env, Error::InvalidRate);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::DefaultRateBps, &default_rate_bps);
        env.storage().instance().set(&DataKey::TotalSavings, &0_i128);
    }

    /// Set a personal auto-save rate (basis points). Requires the user's auth.
    pub fn set_rate(env: Env, user: Address, rate_bps: u32) {
        user.require_auth();
        if rate_bps > MAX_RATE_BPS {
            panic_with_error(&env, Error::InvalidRate);
        }
        let key = DataKey::Rate(user.clone());
        env.storage().persistent().set(&key, &rate_bps);
        bump_persistent(&env, &key);
        bump_instance(&env);
        env.events().publish((symbol_short!("rate"), user), rate_bps);
    }

    /// ⭐ Core: receive a remittance of `amount` from `from`, retain the
    /// user's savings share on-chain, and release the remainder to `user`.
    /// Returns (saved, available). `from` must authorize (it funds the transfer).
    pub fn deposit_remittance(
        env: Env,
        from: Address,
        user: Address,
        amount: i128,
    ) -> (i128, i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error(&env, Error::InvalidAmount);
        }
        let token = Self::require_token(&env);
        let client = token::Client::new(&env, &token);

        // Pull the full remittance into the vault.
        client.transfer(&from, &env.current_contract_address(), &amount);

        let rate = Self::rate_of(env.clone(), user.clone());
        let saved = amount * (rate as i128) / BPS_DENOMINATOR;
        let available = amount - saved;

        // Retain the saved portion; credit the user's on-chain savings balance.
        let savings_key = DataKey::Savings(user.clone());
        let prev: i128 = env.storage().persistent().get(&savings_key).unwrap_or(0);
        env.storage().persistent().set(&savings_key, &(prev + saved));
        bump_persistent(&env, &savings_key);
        bump_persistent(&env, &DataKey::Rate(user.clone()));

        let total: i128 = env.storage().instance().get(&DataKey::TotalSavings).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSavings, &(total + saved));
        bump_instance(&env);

        // Release the spendable remainder to the user.
        if available > 0 {
            client.transfer(&env.current_contract_address(), &user, &available);
        }

        env.events().publish(
            (symbol_short!("remit"), user.clone()),
            (amount, saved, available),
        );
        (saved, available)
    }

    /// Deposit funds straight into savings (100%, no split). Used when a user
    /// manually tops up a goal from their spendable balance. `from` authorizes.
    pub fn deposit_savings(env: Env, from: Address, user: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error(&env, Error::InvalidAmount);
        }
        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        let savings_key = DataKey::Savings(user.clone());
        let prev: i128 = env.storage().persistent().get(&savings_key).unwrap_or(0);
        env.storage().persistent().set(&savings_key, &(prev + amount));
        bump_persistent(&env, &savings_key);
        let total: i128 = env.storage().instance().get(&DataKey::TotalSavings).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSavings, &(total + amount));
        bump_instance(&env);
        env.events().publish((symbol_short!("save"), user), amount);
    }

    /// Withdraw savings back to the user. Requires the user's auth.
    pub fn withdraw(env: Env, user: Address, amount: i128) {
        user.require_auth();
        if amount <= 0 {
            panic_with_error(&env, Error::InvalidAmount);
        }
        let savings_key = DataKey::Savings(user.clone());
        let balance: i128 = env.storage().persistent().get(&savings_key).unwrap_or(0);
        if amount > balance {
            panic_with_error(&env, Error::InsufficientSavings);
        }
        env.storage().persistent().set(&savings_key, &(balance - amount));
        bump_persistent(&env, &savings_key);

        let total: i128 = env.storage().instance().get(&DataKey::TotalSavings).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSavings, &(total - amount));
        bump_instance(&env);

        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

        env.events()
            .publish((symbol_short!("withdraw"), user), amount);
    }

    // ---- Admin (operational safety) ------------------------------------------

    /// Change the fallback auto-save rate for users without an override.
    /// Admin-gated; individual `set_rate` overrides always win.
    pub fn set_default_rate(env: Env, rate_bps: u32) {
        Self::require_admin(&env).require_auth();
        if rate_bps > MAX_RATE_BPS {
            panic_with_error(&env, Error::InvalidRate);
        }
        env.storage()
            .instance()
            .set(&DataKey::DefaultRateBps, &rate_bps);
        bump_instance(&env);
        env.events().publish((symbol_short!("defrate"),), rate_bps);
    }

    /// Upgrade the contract WASM in place (admin-gated). Balances, rates and
    /// the token binding live in storage, so state survives the upgrade —
    /// this is the mainnet incident-response and migration path.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        Self::require_admin(&env).require_auth();
        bump_instance(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ---- Views --------------------------------------------------------------

    pub fn admin(env: Env) -> Address {
        Self::require_admin(&env)
    }

    pub fn savings_of(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Savings(user))
            .unwrap_or(0)
    }

    pub fn rate_of(env: Env, user: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Rate(user))
            .unwrap_or_else(|| {
                env.storage()
                    .instance()
                    .get(&DataKey::DefaultRateBps)
                    .unwrap_or(2000)
            })
    }

    pub fn total_savings(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSavings).unwrap_or(0)
    }

    pub fn token(env: Env) -> Address {
        Self::require_token(&env)
    }

    fn require_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error(env, Error::NotInitialized))
    }

    fn require_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error(env, Error::NotInitialized))
    }
}

fn panic_with_error(env: &Env, err: Error) -> ! {
    soroban_sdk::panic_with_error!(env, err)
}

mod test;
