import "server-only";
import {
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  Keypair,
  xdr,
  scValToNative,
} from "@stellar/stellar-sdk";
import { getStellarConfig } from "./config";
import { makeSoroban } from "./chain";

/**
 * ---------------------------------------------------------------------------
 *  Reflector FX oracle integration (ecosystem composability)
 * ---------------------------------------------------------------------------
 *  Reads live fiat exchange rates from Reflector's on-chain oracle so the
 *  dashboard can show peso (PHP) values — what a Filipino recipient actually
 *  thinks in.
 *
 *  Note on networks: Reflector's *mainnet* fiat feed includes PHP; its
 *  *testnet* feed carries a smaller set (EUR, GBP, …). So on testnet we probe
 *  the oracle with a live read (proving the integration end-to-end) and fall
 *  back to a clearly-labelled reference rate for PHP itself. On mainnet the
 *  same code path returns the live PHP price with no changes.
 * ---------------------------------------------------------------------------
 */

const ORACLES = {
  testnet: "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W",
  public: "CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC",
} as const;

/** Labelled fallback when the (testnet) feed lacks PHP. Env-overridable. */
const REFERENCE_USD_PHP = Number(process.env.FX_REFERENCE_USD_PHP ?? "58.75");

export interface FxInfo {
  /** PHP per 1 USD. */
  usdPhp: number;
  /** "reflector" = live on-chain price · "reference" = labelled fallback. */
  source: "reflector" | "reference";
  /** True when the Reflector oracle answered a live read this refresh. */
  oracleLive: boolean;
  oracleContractId: string;
  updatedAt: string;
}

/** Reflector represents fiat as the enum variant `Other(Symbol)`. */
const fiatAsset = (code: string) =>
  xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(code)]);

async function readOracle(
  soroban: rpc.Server,
  passphrase: string,
  oracleId: string,
  sourceSecret: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<unknown> {
  const kp = Keypair.fromSecret(sourceSecret);
  const account = await soroban.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(new Contract(oracleId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await soroban.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

// Cache for 5 minutes — oracle rounds update on that order anyway.
let cache: { value: FxInfo; expires: number } | null = null;

export async function getFxInfo(): Promise<FxInfo> {
  if (cache && Date.now() < cache.expires) return cache.value;

  const cfg = getStellarConfig();
  const oracleId = ORACLES[cfg.network] ?? ORACLES.testnet;
  const soroban = makeSoroban(cfg.sorobanRpcUrl);

  let usdPhp = REFERENCE_USD_PHP;
  let source: FxInfo["source"] = "reference";
  let oracleLive = false;

  try {
    const decimals = Number(
      await readOracle(soroban, cfg.networkPassphrase, oracleId, cfg.distributor.secret, "decimals"),
    );
    // Try PHP directly (present on the mainnet feed).
    const php = (await readOracle(
      soroban, cfg.networkPassphrase, oracleId, cfg.distributor.secret,
      "lastprice", [fiatAsset("PHP")],
    )) as { price: bigint } | null;

    if (php?.price) {
      // Feed quotes "USD per 1 PHP" → invert for PHP per USD.
      const phpUsd = Number(php.price) / 10 ** decimals;
      if (phpUsd > 0) {
        usdPhp = 1 / phpUsd;
        source = "reflector";
        oracleLive = true;
      }
    } else {
      // Testnet feed lacks PHP — do a live probe (EUR) to verify the oracle
      // integration end-to-end, then use the labelled reference rate.
      const eur = (await readOracle(
        soroban, cfg.networkPassphrase, oracleId, cfg.distributor.secret,
        "lastprice", [fiatAsset("EUR")],
      )) as { price: bigint } | null;
      oracleLive = Boolean(eur?.price);
    }
  } catch (err) {
    console.error("Reflector oracle read failed:", err);
  }

  const value: FxInfo = {
    usdPhp: Math.round(usdPhp * 100) / 100,
    source,
    oracleLive,
    oracleContractId: oracleId,
    updatedAt: new Date().toISOString(),
  };
  cache = { value, expires: Date.now() + 5 * 60 * 1000 };
  return value;
}
