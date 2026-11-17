// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board is every protocol that passes the watchlist's own no-token test (the floor is the only
// thing the watchlist adds): pre-token, not a wrapped, staked or bridged product, not a CEX, not a
// versioned pool. The 40 above the $50M floor are the watchlist; the rest below it are the early
// radar. Live-token protocols are kept apart and shown as the market's own values, never mixed in.
//
// Implied value follows only from the snapshot's own figures, one function for every row:
//
//   tier     = 0.22 when tvl_usd < $100M, 0.25 to $1B, 0.28 above $1B
//              (a launch multiple anchored to TVL; a larger, proven protocol commands more)
//   growth   = clamp(change_7d, -50, 150) per cent (null: 0)
//   growthMult = 1 + 0.55 x tanh(growth / 45)
//              (smooth and saturating: a +150% week is worth 1.55x, a -50% week 0.56x, never more)
//   maturity = 0.55 + 0.45 x age_days / (age_days + 365)
//              (an S-curve: a year of running with no token earns most of the credit, then it flattens;
//               age_days unknown: 365)
//   breadth  = 1 + 0.04 x min(max(chains - 1, 0), 5)
//              (a secondary signal: each extra chain is a little more reach, capped at +20%)
//   implied  = max(1, round(tvl_usd x tier x growthMult x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Launch multiple of TVL by size tier: below $100M, $100M-$1B, above $1B. */
  tier_below_100m: number;
  tier_to_1b: number;
  tier_above_1b: number;
  tier_100m: number;
  tier_1b: number;
  /** Growth: the tanh weight and scale, and the clamp applied to change_7d first. */
  growth_weight: number;
  growth_scale: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity: the S-curve's floor, range and half-life in days. */
  maturity_floor: number;
  maturity_range: number;
  maturity_half_life_days: number;
  unknown_age_days: number;
  /** Breadth: per extra chain, and the most extra chains that count. */
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  tier_below_100m: 0.22,
  tier_to_1b: 0.25,
  tier_above_1b: 0.28,
  tier_100m: 100_000_000,
  tier_1b: 1_000_000_000,
  growth_weight: 0.55,
  growth_scale: 45,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_half_life_days: 365,
  unknown_age_days: 365,
  breadth_per_chain: 0.04,
  breadth_max_chains: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 32;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    tier_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  tier_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The launch multiple of TVL by the protocol's size tier. */
export function tierMultiple(tvlUsd: number, model: ModelConstants): number {
  if (tvlUsd >= model.tier_1b) return model.tier_above_1b;
  if (tvlUsd >= model.tier_100m) return model.tier_to_1b;
  return model.tier_below_100m;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; tierMult: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + model.growth_weight * Math.tanh(growthPct / model.growth_scale);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + model.maturity_range * (Math.max(ageForModel, 0) / (Math.max(ageForModel, 0) + model.maturity_half_life_days));
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const tierMult = tierMultiple(protocol.tvl_usd, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * tierMult * growthMult * maturityMult * breadthMult));
  return { implied, tierMult, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * The categories the watchlist rule keeps out: a wrapped, staked or bridged product of a protocol
 * whose token already trades is not a token that does not exist yet (WBTC is Bitcoin on Ethereum,
 * a staked-ETH product is ETH in a staking wrapper), and neither is an exchange's own product.
 */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked or staking is a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name is that exchange's product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: the watchlist's own no-token test, the floor aside.
 * Pre-token, not a wrapped, staked or bridged product, not an exchange, not a versioned pool.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable protocol below the watchlist floor, by TVL. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen. The floor is the only difference between a
  // watchlist row and an early row, so the board is every protocol that passes the watchlist's own
  // no-token test.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, tierMult, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, tierMult, growthPct, growthMult, maturityMult, breadthMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      tier_multiple: s.tierMult,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's two actions, in the words a farmer can follow: the main position and a second leg. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const half = Math.max(25, Math.round(capital / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return {
    primary: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the position open.`,
    secondary: `Borrow $${half} of a stablecoin against the supply, keep the health factor above 2, and repay it before the hold ends.`,
  };
  if (c.includes('dex') || c.includes('leveraged farm')) return {
    primary: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
    secondary: `Swap $${half} through ${name}'s own router on ${chain} once, so the wallet records a trade as well as liquidity.`,
  };
  if (c.includes('bridge')) return {
    primary: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
    secondary: `Bridge $${half} back through ${name} a week later, so the wallet shows activity in both directions.`,
  };
  if (c.includes('restak') || c.includes('staking')) return {
    primary: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
    secondary: `Restake or delegate the receipt for $${half} through ${name}'s second option, so the wallet holds two staking positions.`,
  };
  if (c.includes('perpetual') || c.includes('derivative')) return {
    primary: `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
    secondary: `Close the hedge and open a second small trade of $${half} a week later, keeping total exposure under $${capital}.`,
  };
  if (c.includes('prediction')) return {
    primary: `Fund $${capital} and place one market position on ${name}.`,
    secondary: `Place a second position of $${half} in a different market on ${name}.`,
  };
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return {
    primary: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    secondary: `Deposit $${half} into a second ${name} vault with a different risk profile and hold both shares.`,
  };
  if (c.includes('stable')) return {
    primary: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
    secondary: `Use $${half} of the stable asset in a lending pool on ${chain} so the wallet shows the stable in use.`,
  };
  if (c.includes('rwa')) return {
    primary: `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`,
    secondary: `Check the redemption window for the yield asset and hold a $${half} second mint through the next window.`,
  };
  if (c.includes('insurance')) return {
    primary: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
    secondary: `Buy a second, smaller $${half} policy for a different asset on ${name}.`,
  };
  if (c.includes('yield aggregator')) return {
    primary: `Deposit $${capital} into ${name}'s main vault on ${chain} and let it compound.`,
    secondary: `Harvest or compound the vault's yield once, so the wallet records a harvest as well as a deposit.`,
  };
  if (c.includes('yield')) return {
    primary: `Deposit $${capital} into ${name}'s highest-TVL yield pool on ${chain} and keep the position open.`,
    secondary: `Move $${half} of the position into a second ${name} pool with a different asset pair.`,
  };
  return {
    primary: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    secondary: `Make a second $${half} deposit into a different pool of ${name} on ${chain}.`,
  };
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the category picks the two actions, the TVL picks the capital, the chains pick the
 * cross-chain step, and the age picks the hold.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { primary, secondary } = actionsFor(p, capital, chain);
  const half = Math.max(25, Math.round(capital / 2));
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const crossChain: FarmStep = secondChain === null
    ? {
      text: `Deepen the position on ${chain}: add a second asset worth $${half} to the same protocol, so the wallet shows two positions instead of one.`,
      cost: `$${half} of capital and about $4 of gas`,
      time: '15 minutes',
    }
    : {
      text: `Repeat a smaller position of $${half} on ${secondChain} through the same protocol, so the wallet is active on two of its chains.`,
      cost: `$${half} of capital and about $4 of gas`,
      time: '15 minutes',
    };
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: primary,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondary,
      cost: `$${half} of capital and about $3 of gas`,
      time: '10 minutes',
    },
    crossChain,
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Join the protocol's community channel and read its announcements once a week, so you catch any points program or snapshot before it closes.`,
      cost: 'free',
      time: '10 minutes a week',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; write the wallet, the dates and every transaction in a farm log, then unwind in two smaller withdrawals to check the gas.`,
      cost: 'no fee to check, and never pay to claim',
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    tier_multiple: row.model.tier_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
