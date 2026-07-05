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
