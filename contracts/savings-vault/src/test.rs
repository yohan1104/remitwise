#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env};

fn setup() -> (Env, SavingsVaultClient<'static>, Address, token::Client<'static>, token::StellarAssetClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = sac.address();
    let token_client = token::Client::new(&env, &token_addr);
    let token_admin = token::StellarAssetClient::new(&env, &token_addr);

    let contract_id = env.register(SavingsVault, ());
    let client = SavingsVaultClient::new(&env, &contract_id);
    client.initialize(&admin, &token_addr, &2000u32); // 20%

    (env, client, token_addr, token_client, token_admin)
}

#[test]
fn deposit_splits_and_retains_savings() {
    let (env, client, _token, token_client, token_admin) = setup();
    let distributor = Address::generate(&env);
    let user = Address::generate(&env);

    // 1000 units minted to the sender.
    token_admin.mint(&distributor, &1000);

    let (saved, available) = client.deposit_remittance(&distributor, &user, &1000);
    assert_eq!(saved, 200); // 20%
    assert_eq!(available, 800);

    // User received the spendable portion; vault retained savings.
    assert_eq!(token_client.balance(&user), 800);
    assert_eq!(client.savings_of(&user), 200);
    assert_eq!(client.total_savings(), 200);
}

#[test]
fn per_user_rate_override() {
    let (env, client, _t, _tc, token_admin) = setup();
    let user = Address::generate(&env);
    let distributor = Address::generate(&env);
    token_admin.mint(&distributor, &1000);

    client.set_rate(&user, &3000u32); // 30%
    assert_eq!(client.rate_of(&user), 3000);

    let (saved, available) = client.deposit_remittance(&distributor, &user, &1000);
    assert_eq!(saved, 300);
    assert_eq!(available, 700);
}

#[test]
fn withdraw_releases_savings() {
    let (env, client, _t, token_client, token_admin) = setup();
    let user = Address::generate(&env);
    let distributor = Address::generate(&env);
    token_admin.mint(&distributor, &1000);
    client.deposit_remittance(&distributor, &user, &1000);

    client.withdraw(&user, &150);
    assert_eq!(client.savings_of(&user), 50);
    assert_eq!(token_client.balance(&user), 950); // 800 + 150
}

#[test]
fn deposit_savings_adds_full_amount() {
    let (env, client, _t, token_client, token_admin) = setup();
    let user = Address::generate(&env);
    token_admin.mint(&user, &500);

    client.deposit_savings(&user, &user, &500);
    assert_eq!(client.savings_of(&user), 500); // 100%, no split
    assert_eq!(token_client.balance(&user), 0);
}

#[test]
#[should_panic]
fn cannot_overdraw_savings() {
    let (env, client, _t, _tc, token_admin) = setup();
    let user = Address::generate(&env);
    let distributor = Address::generate(&env);
    token_admin.mint(&distributor, &1000);
    client.deposit_remittance(&distributor, &user, &1000);
    client.withdraw(&user, &999); // only 200 saved
}

#[test]
#[should_panic]
fn rejects_zero_amount_deposit() {
    let (env, client, _t, _tc, _ta) = setup();
    let user = Address::generate(&env);
    let distributor = Address::generate(&env);
    client.deposit_remittance(&distributor, &user, &0);
}

#[test]
#[should_panic]
fn rejects_rate_above_cap() {
    let (env, client, _t, _tc, _ta) = setup();
    let user = Address::generate(&env);
    client.set_rate(&user, &9001u32); // above MAX_RATE_BPS
}

#[test]
#[should_panic]
fn cannot_initialize_twice() {
    let (env, client, token, _tc, _ta) = setup();
    let intruder = Address::generate(&env);
    client.initialize(&intruder, &token, &1000u32);
}

#[test]
fn admin_can_change_default_rate() {
    let (env, client, _t, _tc, token_admin) = setup();
    let user = Address::generate(&env);
    let distributor = Address::generate(&env);
    token_admin.mint(&distributor, &1000);

    client.set_default_rate(&2500u32); // 25%
    assert_eq!(client.rate_of(&user), 2500); // no personal override → new default

    let (saved, available) = client.deposit_remittance(&distributor, &user, &1000);
    assert_eq!(saved, 250);
    assert_eq!(available, 750);
}

#[test]
#[should_panic]
fn default_rate_respects_cap() {
    let (_env, client, _t, _tc, _ta) = setup();
    client.set_default_rate(&9500u32);
}

#[test]
fn personal_override_survives_default_change() {
    let (env, client, _t, _tc, _ta) = setup();
    let user = Address::generate(&env);
    client.set_rate(&user, &4000u32);
    client.set_default_rate(&1000u32);
    assert_eq!(client.rate_of(&user), 4000); // override wins
}

#[test]
fn exposes_admin_and_token() {
    let (_env, client, token, _tc, _ta) = setup();
    assert_eq!(client.token(), token);
    client.admin(); // must not panic once initialized
}

#[test]
fn total_savings_tracks_all_users() {
    let (env, client, _t, _tc, token_admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let distributor = Address::generate(&env);
    token_admin.mint(&distributor, &3000);

    client.deposit_remittance(&distributor, &a, &1000); // saves 200
    client.deposit_remittance(&distributor, &b, &2000); // saves 400
    assert_eq!(client.total_savings(), 600);

    client.withdraw(&a, &200);
    assert_eq!(client.total_savings(), 400);
}
