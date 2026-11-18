// Token Radar — scoring model (radar-2) and board builder.
//
// The model scores every pre-token protocol from the snapshot's own figures
// only: its TVL, its seven-day growth, how long it has run with no token,
// and how many chains it lives on. No protocol name is special-cased.
//
//   implied = round(
//     tvl
//     * tier(tvl)
//     * (1 + 0.55 * tanh(clamp(change_7d, -50, 150) / 45))
//     * (0.55 + 0.45 * age / (age + 365))
//     * (1 + 0.04 * min(chains - 1, 5))
//   )
//
// Tier is a launch multiple anchored to size: a larger, proven protocol
// commands a higher multiple. Growth is a smooth, saturating tanh: a +150%
// week is worth 1.55x, a -50% week 0.56x, never more. Maturity is an
// S-curve on days since first listed: a year of running with no token earns
// most of the credit, then it flattens. Breadth is a small secondary signal
// for protocols live on more chains, capped at +20%.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  tier: number;
  growthChange: number | null;
  growth: number;
  maturity: number;
  breadth: number;
  ageDays: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  rank: number;
  implied_value_usd: number;
  watchlist: boolean;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  rank: number;
  mcap_usd: number;
  symbol: string | null;
}

// ---------------------------------------------------------------------------
// The no-token test (the watchlist's own rule, the floor aside)
// ---------------------------------------------------------------------------

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** True when a protocol records no token and is not a wrapped, staked or
 *  bridged product, not an exchange, and not a versioned pool. */
export function passesNoTokenTest(p: SnapshotProtocol): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function tierFor(tvlUsd: number): number {
  if (tvlUsd < 100_000_000) return 0.22;
  if (tvlUsd <= 1_000_000_000) return 0.25;
  return 0.28;
}

export function ageDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 365;
  const start = Date.parse(listedAt + "T00:00:00Z");
  const end = Date.parse(asOf + "T00:00:00Z");
  const days = Math.floor((end - start) / 86_400_000);
  return days < 0 ? 0 : days;
}

export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
): { value: number; breakdown: ModelBreakdown } {
  const tier = tierFor(p.tvl_usd);
  const change = p.change_7d === null ? 0 : p.change_7d;
  const clamped = Math.max(-50, Math.min(150, change));
  const growth = 1 + 0.55 * Math.tanh(clamped / 45);
  const age = ageDays(p.listed_at, asOf);
  const maturity = 0.55 + (0.45 * age) / (age + 365);
  const breadth = 1 + 0.04 * Math.min(p.chains.length - 1, 5);
  const value = Math.round(p.tvl_usd * tier * growth * maturity * breadth);
  return {
    value,
    breakdown: {
      tier,
      growthChange: p.change_7d,
      growth,
      maturity,
      breadth,
      ageDays: age,
    },
  };
}

// ---------------------------------------------------------------------------
// Farm-plan sizing helpers. One sizing rule, used by every step: the
// dashboard never recomputes these, it renders the plan board.json carries.
// ---------------------------------------------------------------------------

/** Base farming capital for a protocol of this size. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 200;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

const GAS_BY_CHAIN: Record<string, number> = {
  Ethereum: 8,
  Base: 3,
  Arbitrum: 4,
  Optimism: 3,
  Polygon: 2,
  Avalanche: 3,
  BSC: 2,
  "BNB Chain": 2,
  Solana: 1,
  Tron: 2,
  Ink: 3,
  Monad: 2,
  Katana: 3,
  Unichain: 3,
  Corn: 3,
  Arc: 3,
  Flare: 2,
  Stellar: 1,
  Sui: 1,
  Aptos: 1,
  Hyperliquid: 2,
  Berachain: 2,
  Linea: 3,
  Scroll: 3,
  zkSync: 3,
  Fantom: 2,
  Gnosis: 2,
  Celo: 2,
  Moonbeam: 3,
  "Robinhood Chain": 3,
};

/** Typical gas cost in dollars for one transaction on a chain. */
export function gasFor(chain: string): number {
  return GAS_BY_CHAIN[chain] ?? 3;
}

/** How long to hold a position, in days, from the protocol's age. */
export function holdDaysFor(ageDays: number): number {
  return Math.max(14, Math.min(180, Math.round(ageDays / 3)));
}

/** The product noun a protocol's main deposit goes into. */
export function productFor(category: string | null): string {
  switch (category) {
    case "Risk Curators":
      return "vault";
    case "Onchain Capital Allocator":
      return "strategy";
    case "Yield":
    case "Yield Aggregator":
      return "vault";
    case "Lending":
      return "lending pool";
    case "Dexs":
      return "liquidity pool";
    case "CDP":
    case "CDP Manager":
      return "vault";
    case "Derivatives":
    case "Interest Rate Derivatives":
      return "market";
    case "RWA":
      return "offering";
    case "Basis Trading":
      return "strategy";
    case "Chain":
      return "validator";
    case "Staking Pool":
      return "staking pool";
    case "Liquidity Manager":
      return "position";
    case "Leveraged Farming":
    case "Farm":
      return "farm";
    case "Restaking":
      return "restaking pool";
    case "Anchor BTC":
    case "Decentralized BTC":
      return "vault";
    case "CeDeFi":
      return "account";
    case "Dual-Token Stablecoin":
      return "vault";
    case "Prediction Market":
      return "market";
    case "Stablecoin Wrapper":
      return "wrapper";
    case "Uncollateralized Lending":
      return "credit pool";
    case "Cross Chain Bridge":
      return "bridge";
    case "OTC Marketplace":
      return "desk";
    case "Insurance":
      return "cover pool";
    case "Payments":
      return "wallet";
    case "Governance Incentives":
      return "lock";
    case "Crypto Card Issuer":
      return "card";
    case "Indexes":
      return "index";
    case "Collateral Markets":
      return "market";
    default:
      return "product";
  }
}

// ---------------------------------------------------------------------------
// Category actions: two concrete things to do per category. Each action is
// a template filled with the protocol's name, chain and capital. A category
// the table does not name falls back to the generic pair.
// ---------------------------------------------------------------------------

type ActionPair = [string, string];

const CATEGORY_ACTIONS: Record<string, ActionPair> = {
  "Risk Curators": [
    "Allocate to a curated vault that matches your risk appetite and read its strategy note before depositing",
    "Compare two curators on fees and past performance, then move half the position to the better one",
  ],
  "Onchain Capital Allocator": [
    "Deposit into the allocator's flagship strategy and note its lock-up and fee schedule",
    "Split the position across two of its strategies to spread manager risk",
  ],
  Dexs: [
    "Provide liquidity to the most active pool and keep the position inside its earning range",
    "Swap a small amount through the router each week to keep the wallet active",
  ],
  Lending: [
    "Supply the asset to the lending pool and watch the supply rate each week",
    "Borrow a small amount against the supplied collateral to show both sides of the market",
  ],
  Yield: [
    "Deposit into the highest-yield vault and leave auto-compounding switched on",
    "Harvest the rewards weekly and compound them back into the same vault",
  ],
  "Yield Aggregator": [
    "Deposit into the aggregator's top vault and track its net yield against the base rate",
    "Rotate a small share into a second vault when its yield beats the first by a clear margin",
  ],
  CDP: [
    "Mint the protocol's stable asset against collateral and keep the ratio above the safe line",
    "Repay part of the minted debt after a month to lower liquidation risk",
  ],
  Derivatives: [
    "Open a small perpetual position with low leverage and a stop loss in place",
    "Close the position after two weeks and record the funding paid",
  ],
  RWA: [
    "Buy into the tokenised asset offering and read the underlying asset report first",
    "Hold the position through one full income cycle before judging the yield",
  ],
  "Basis Trading": [
    "Deposit into the basis strategy and track the funding rate every day",
    "Withdraw a test amount to confirm the redemption path works before sizing up",
  ],
  Chain: [
    "Bridge a small amount to the chain and use its native apps once",
    "Stake the chain's native asset through a validator and keep the receipt",
  ],
  "Staking Pool": [
    "Stake through the pool and keep the receipt token in the same wallet",
    "Unstake a test amount to confirm the exit queue and delay",
  ],
  "Liquidity Manager": [
    "Deposit into a managed liquidity position and check its range every week",
    "Rebalance the position when it drifts out of range",
  ],
  "Leveraged Farming": [
    "Open a leveraged farm at the lowest leverage and watch the health factor daily",
    "Close the farm if the health factor falls near the liquidation limit",
  ],
  Restaking: [
    "Restake the receipt token and track the restaking yield each week",
    "Withdraw a test amount to confirm the unstaking delay",
  ],
  "Anchor BTC": [
    "Deposit BTC-backed collateral and mint the anchored asset against it",
    "Redeem a small amount to confirm the peg holds before sizing up",
  ],
  "Decentralized BTC": [
    "Wrap BTC through the protocol and use it in its lending market",
    "Unwrap a test amount to confirm the redemption works",
  ],
  CeDeFi: [
    "Deposit through the custodial on-ramp and verify the balance on-chain",
    "Withdraw a test amount to confirm the off-ramp works",
  ],
  "Dual-Token Stablecoin": [
    "Mint the stable asset with the paired token and hold both sides",
    "Redeem a small amount to confirm the two-token peg",
  ],
  Farm: [
    "Deposit into the farm and claim the rewards every week",
    "Compound the claimed rewards back into the farm",
  ],
  "Prediction Market": [
    "Place a small prediction on an outcome you have researched",
    "Close the position before the market resolves",
  ],
  "Stablecoin Wrapper": [
    "Wrap the stablecoin and use the wrapped version in the protocol's market",
    "Unwrap a test amount to confirm the peg",
  ],
  "Uncollateralized Lending": [
    "Lend a small amount through the credit pool and track repayments",
    "Withdraw a test amount to confirm liquidity is there",
  ],
  "Interest Rate Derivatives": [
    "Buy the fixed-rate leg for one term and hold it to maturity",
    "Sell the position before expiry if the rate moves against you",
  ],
  "Cross Chain Bridge": [
    "Bridge a small amount across and confirm it arrives on the other side",
    "Bridge a test amount back to confirm the return path",
  ],
  "CDP Manager": [
    "Open a managed CDP position and set an alert below the safe ratio",
    "Top up the collateral when the ratio falls toward the line",
  ],
  "OTC Marketplace": [
    "Place a small OTC order and settle it through escrow",
    "Complete one full trade cycle before sizing up",
  ],
  Insurance: [
    "Buy cover for the position and note the claim window",
    "File a test claim inquiry to learn the process before you need it",
  ],
  Payments: [
    "Send a payment through the network and confirm it settles",
    "Receive a payment to the same wallet to complete the loop",
  ],
  "Governance Incentives": [
    "Lock the asset for governance rewards and vote on one proposal",
    "Claim the voting rewards after the lock ends",
  ],
  "Crypto Card Issuer": [
    "Order the card and spend a small amount through it",
    "Top up the card balance and track the cashback",
  ],
  Indexes: [
    "Buy the index token and hold it through one rebalance",
    "Compare the index return with holding the parts yourself",
  ],
  "Collateral Markets": [
    "Deposit collateral into the market and borrow a small amount against it",
    "Repay the loan and withdraw the collateral to test the exit",
  ],
};

const GENERIC_ACTIONS: ActionPair = [
  "Use the protocol's main product with a small position and read its docs first",
  "Try a second feature of the same protocol to show broader use",
];

function categoryActions(category: string | null): ActionPair {
  if (category !== null && category in CATEGORY_ACTIONS) {
    return CATEGORY_ACTIONS[category];
  }
  return GENERIC_ACTIONS;
}

// ---------------------------------------------------------------------------
// Farm plans: 8 concrete steps per row. Every step carries what it costs
// and how long it takes. Steps are built from the protocol's own figures —
// its name, chains, TVL-sized capital and age-derived hold — so the plan
// for one protocol never reads as the plan for another.
// ---------------------------------------------------------------------------

export function farmSteps(p: SnapshotProtocol, age: number): string[] {
  const capital = capitalFor(p.tvl_usd);
  const half = Math.max(10, Math.round(capital / 2));
  const first = p.chains[0] ?? "Ethereum";
  const second = p.chains.length > 1 ? p.chains[1] : first;
  const product = productFor(p.category);
  const hold = holdDaysFor(age);
  const gas1 = gasFor(first);
  const gas2 = gasFor(second);
  const [action1, action2] = categoryActions(p.category);

  const steps: string[] = [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $${gas1} of gas for the first transaction. Time: 5 minutes.`,
    `Deposit $${capital} into a ${p.name} ${product} on ${first} and keep the shares. Cost: $${capital} of capital and about $${gas1} of gas. Time: 15 minutes to set up and confirm.`,
    `Deposit $${half} into a second ${p.name} ${product} with a different risk profile and hold both shares. Cost: $${half} of capital and about $${gas1} of gas. Time: 10 minutes.`,
  ];

  if (p.chains.length > 1) {
    steps.push(
      `Repeat a smaller position of $${half} on ${second} through the same protocol, so the wallet is active on two of its chains. Cost: $${half} of capital and about $${gas2} of gas. Time: 15 minutes.`,
    );
  } else {
    steps.push(
      `Open a second position of $${half} on ${first} in a different ${p.name} ${product}, so the wallet shows broader use. Cost: $${half} of capital and about $${gas1} of gas. Time: 15 minutes.`,
    );
  }

  steps.push(
    `${action1} on ${first}. Cost: no new capital, about $${gas1} of gas. Time: 20 minutes to compare and record.`,
    `${action2} on ${first}, using the same wallet as the first deposit. Cost: no new capital, about $${gas1} of gas. Time: 15 minutes.`,
    `Hold the position for at least ${hold} days and check the protocol's points or rewards page weekly, so activity is steady rather than a single burst. Cost: no new capital, about $1 of gas a week. Time: 5 minutes a week.`,
    `Watch for the token announcement, then claim any airdrop from the protocol's own claim page and move the position only after the claim is confirmed. Cost: about $5 of gas to claim. Time: 10 minutes when live.`,
  );

  return steps.map((s) => s.trim());
}

// ---------------------------------------------------------------------------
// Board construction
// ---------------------------------------------------------------------------

export interface BuiltBoard {
  rows: BoardRow[];
  live: LiveRow[];
  watchlistCount: number;
  earlyCount: number;
}

export function buildBoard(snapshot: Snapshot): BuiltBoard {
  const watchlist = new Set(snapshot.watchlist);

  const scored: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!passesNoTokenTest(p)) continue;
    const { value, breakdown } = scoreProtocol(p, snapshot.as_of);
    scored.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: breakdown.ageDays,
      rank: 0,
      implied_value_usd: value,
      watchlist: watchlist.has(p.slug),
      model: breakdown,
      farm_steps: farmSteps(p, breakdown.ageDays),
    });
  }

  // Strongest implied value first; slug breaks the rare tie deterministically.
  scored.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    return a.slug < b.slug ? -1 : 1;
  });
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  // Live-token protocols, set aside: the largest 32 by market cap.
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 32)
    .map((p, i) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p.listed_at, snapshot.as_of),
      rank: i + 1,
      mcap_usd: p.mcap_usd as number,
      symbol: p.symbol,
    }));

  return {
    rows: scored,
    live,
    watchlistCount: scored.filter((r) => r.watchlist).length,
    earlyCount: scored.filter((r) => !r.watchlist).length,
  };
}
