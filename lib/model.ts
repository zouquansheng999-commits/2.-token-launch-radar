// Token Radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor, chosen by implied value, not by TVL alone.
//
// A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol); live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board.
//
// Implied value is FITTED, not hand-set. The snapshot carries 117 launched protocols with a real
// market cap and a TVL (after excluding CEX products, wrapped/staked/versioned names and zero
// market caps). A pooled log-log regression of market cap on TVL over those 117 gives
// log10(market cap) = 3.39 + 0.47 x log10(TVL), R-squared 0.15, residual spread 0.88 dex.
// Held out (every fifth protocol by slug, 23 rows, fitted on the other 94), the median absolute
// error is 87% and 78% of predictions land within 2x of the real market cap. That is far better
// than the hand-set radar-2 formula, whose median error on the same launched set is 469% — and
// it is also honest about its limits: market cap per TVL in this snapshot spans four orders of
// magnitude (median 0.24x, interquartile 0.05x to 1.04x), so no TVL-only model can be precise.
// Every row therefore carries an 80% interval from the fit's own residual spread, and the
// dashboard says so in plain words. The value basis is MARKET CAP (mcap_usd): the snapshot
// carries no fully-diluted value, and nothing here pretends otherwise.
//
// The small adjustments — seven-day growth, age with no token, chain reach — were TESTED on the
// same launched set before being kept: regressing log10(market cap / TVL) on them explains
// almost nothing (R-squared 0.02; correlations -0.07, -0.14 and -0.00). They carry no pricing
// signal in launched data, so they enter only as small bounded ordering terms (growth at most
// +/-15%, maturity 0.90 to 1.10, reach at most +6%), never as value drivers: the fitted TVL
// term carries the value. Keeping them bounded and labelled is the honest middle between
// dropping the launch-timing signals the brief names and pretending they price anything.
//
// Sensitivity: dropping the 7 launched protocols whose market cap per TVL sits outside
// 0.001x-10x (a 400x outlier among them) moves the fit to intercept 2.44, slope 0.59,
// R-squared 0.29. Same direction, wider level uncertainty — one more reason every row carries
// its interval. No protocol name is ever special-cased: the same fitted function scores every row.

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

/** The fitted value model: the regression lives in fitValueModel; these are only the small bounded ordering terms. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_multiplier: number;
  reach_per_chain: number;
  reach_max_chains: number;
}

/** The maturity cap: a protocol stops earning age credit after four years running with no token. */
export const MATURITY_CAP_DAYS = 1460;

/** The reach bonus per chain, capped at six chains: breadth helps, but only up to a point. */
export const REACH_PER_CHAIN = 0.01;
export const REACH_MAX_CHAINS = 6;

/**
 * The ordering terms, kept small on purpose: the launched set showed they carry no pricing
 * signal (R-squared 0.02), so growth moves a value by at most +/-15%, maturity by 0.90 to 1.10,
 * reach by at most +6%. The fitted TVL term carries the value; these only order near-ties.
 */
export const MODEL: ModelConstants = {
  growth_weight: 0.3,
  growth_floor: -50,
  growth_cap: 50,
  maturity_floor: 0.9,
  maturity_range: 0.2,
  maturity_days: MATURITY_CAP_DAYS,
  unknown_age_multiplier: 0.95,
  reach_per_chain: REACH_PER_CHAIN,
  reach_max_chains: REACH_MAX_CHAINS,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by implied value. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The fitted regression and its validation, computed from the snapshot itself at run time. */
export interface FitStats {
  /** Launched protocols the fit was trained on (market cap and TVL both positive, after exclusions). */
  n: number;
  /** log10(market cap) = intercept + slope x log10(TVL). */
  intercept: number;
  slope: number;
  /** Share of log market-cap variance the TVL term explains. */
  r2: number;
  /** Residual spread in dex (log10 units) around the fitted line. */
  residual_sd: number;
  /** Held-out rows (every fifth protocol by slug). */
  held_out_n: number;
  /** Median absolute percentage error on the held-out rows, with the ordering terms applied. */
  held_out_med_ape_pct: number;
  /** Share of held-out rows predicted within 2x of the real market cap. */
  held_out_within_2x_pct: number;
  /** Share of held-out rows predicted within 50% of the real market cap. */
  held_out_within_50_pct: number;
  /** The same fit after dropping the 7 launched protocols with market cap per TVL outside 0.001x-10x. */
  trimmed_n: number;
  trimmed_intercept: number;
  trimmed_slope: number;
  trimmed_r2: number;
  /** Launched protocols dropped because their market cap is zero (not a usable comparable). */
  excluded_zero_mcap: number;
  /** What the fit prices: market cap, because the snapshot carries no fully-diluted value. */
  value_basis: string;
}

/** One launched comparable behind a board row's value: same neighbourhood of TVL, already trading. */
export interface Comparable {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl: number;
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
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
    band_low_usd: number;
    band_high_usd: number;
  };
  comparables: Comparable[];
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
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
  age_days: number | null;
  implied_value_usd: number;
  base_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  comparables: Comparable[];
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

/** Everything the dashboard needs: the board, the live set, the fit and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: FitStats;
  watchlist_size: number;
  watchlist: string[];
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

/** The fitted base and the small ordering terms one protocol gets, under `fit` and `model`. */
export function predictValue(
  protocol: SnapshotProtocol,
  asOf: string,
  intercept: number,
  slope: number,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  // A score needs a positive TVL: log10 of zero or a negative number is not a score.
  if (!Number.isFinite(protocol.tvl_usd) || protocol.tvl_usd <= 0) {
    throw new SnapshotError(`protocol ${protocol.slug} has TVL ${protocol.tvl_usd}: a score needs a positive TVL`);
  }
  const base = Math.pow(10, intercept + slope * Math.log10(protocol.tvl_usd));
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult =
    age === null
      ? model.unknown_age_multiplier
      : model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + Math.min(protocol.chains.length, model.reach_max_chains) * model.reach_per_chain;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * reachMult));
  return { implied, base: Math.max(1, Math.round(base)), growthPct, growthMult, maturityMult, reachMult, age };
}

/** The multipliers, the implied value and its 80% interval one protocol gets under `fit` and `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: FitStats,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null; bandLow: number; bandHigh: number } {
  const v = predictValue(protocol, asOf, fit.intercept, fit.slope, model);
  const factor = Math.pow(10, 1.2816 * fit.residual_sd);
  const bandLow = Math.max(1, Math.round(v.implied / factor));
  const bandHigh = Math.round(v.implied * factor);
  return { ...v, bandLow, bandHigh };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Exchanges whose name at the start of a protocol name marks a CEX product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** A whole word, wrapped, staked or staking, anywhere in a name. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned
 * pool, and not named as a wrapped or staked product. A category alone does not disqualify:
 * a pre-token bridge or liquid-staking protocol records no token that trades, so its launch is
 * still a launch; the name rules catch the actual wrapped products (WBTC, Binance staked ETH
 * and the like), which the snapshot's own watchlist rule also excludes by name.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Whether a launched protocol is a usable comparable: a real market cap and TVL, not an exchange, not a versioned pool, not a wrapped or staked product. */
export function isComparable(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || !Number.isFinite(p.mcap_usd) || p.mcap_usd <= 0) return false;
  if (!Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Ordinary least squares on two equal-length lists: intercept, slope, R-squared, residual spread. */
function ols(xs: number[], ys: number[]): { a: number; b: number; r2: number; sd: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    syy += (ys[i]! - my) * (ys[i]! - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i]! - (a + b * xs[i]!)) * (ys[i]! - (a + b * xs[i]!));
  const sd = n > 2 ? Math.sqrt(ss / (n - 2)) : 0;
  return { a, b, r2, sd };
}

/** The median of a sorted list's upper middle: the same rule the analysis used, kept deterministic. */
function medianSorted(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * The fitted value model, computed from the snapshot itself: a pooled log-log regression of
 * market cap on TVL over the launched comparables, validated on a deterministic held-out split
 * (slug-sorted order, every fifth row), with a sensitivity fit that drops the extreme
 * market-cap-per-TVL ratios. Pure arithmetic on the input: the same snapshot always fits the
 * same numbers, so two runs write the same bytes.
 */
export function fitValueModel(snapshot: Snapshot, model: ModelConstants = MODEL): FitStats {
  const launched = snapshot.protocols.filter(isComparable);
  const zeroMcap = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && Number.isFinite(p.mcap_usd) && (p.mcap_usd as number) <= 0,
  ).length;
  if (launched.length < 10) {
    throw new SnapshotError(`snapshot carries ${launched.length} launched comparables: a fit needs at least 10`);
  }
  const sorted = [...launched].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const full = ols(
    sorted.map((p) => Math.log10(p.tvl_usd)),
    sorted.map((p) => Math.log10(p.mcap_usd as number)),
  );
  const train = sorted.filter((_, i) => i % 5 !== 4);
  const test = sorted.filter((_, i) => i % 5 === 4);
  const split = ols(
    train.map((p) => Math.log10(p.tvl_usd)),
    train.map((p) => Math.log10(p.mcap_usd as number)),
  );
  const errors = test
    .map((p) => {
      const pred = predictValue(p, snapshot.as_of, split.a, split.b, model).implied;
      return Math.abs(pred - (p.mcap_usd as number)) / (p.mcap_usd as number);
    })
    .sort((a, b) => a - b);
  const trimmed = sorted.filter((p) => {
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    return ratio >= 0.001 && ratio <= 10;
  });
  const trimFit = ols(
    trimmed.map((p) => Math.log10(p.tvl_usd)),
    trimmed.map((p) => Math.log10(p.mcap_usd as number)),
  );
  return {
    n: launched.length,
    intercept: full.a,
    slope: full.b,
    r2: full.r2,
    residual_sd: full.sd,
    held_out_n: test.length,
    held_out_med_ape_pct: medianSorted(errors) * 100,
    held_out_within_2x_pct: (errors.filter((e) => e <= 1).length / errors.length) * 100,
    held_out_within_50_pct: (errors.filter((e) => e <= 0.5).length / errors.length) * 100,
    trimmed_n: trimmed.length,
    trimmed_intercept: trimFit.a,
    trimmed_slope: trimFit.b,
    trimmed_r2: trimFit.r2,
    excluded_zero_mcap: zeroMcap,
    value_basis: 'market cap (mcap_usd); the snapshot carries no fully-diluted value',
  };
}

/** A launched protocol's market cap per TVL, rounded for display. */
function comparableOf(p: SnapshotProtocol): Comparable {
  return {
    slug: p.slug,
    name: p.name,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd as number,
    mcap_tvl: round4((p.mcap_usd as number) / p.tvl_usd),
  };
}

/**
 * The three nearest launched comparables behind one pre-token row: closest in log TVL, with a
 * same-category credit of 0.3 dex (about a 2x size difference) so a same-category protocol
 * wins a near-tie but never a 200x size mismatch. A comparable is evidence, not a prediction:
 * it shows what the market already pays for a protocol of this size.
 */
export function comparablesFor(row: SnapshotProtocol, launched: SnapshotProtocol[]): Comparable[] {
  const rowLog = Math.log10(row.tvl_usd);
  return [...launched]
    .sort((a, b) => {
      const score = (p: SnapshotProtocol): number =>
        Math.abs(Math.log10(p.tvl_usd) - rowLog) - ((p.category ?? '') === (row.category ?? '') ? 0.3 : 0);
      const dA = score(a);
      const dB = score(b);
      if (dA !== dB) return dA - dB;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .slice(0, 3)
    .map(comparableOf);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FitStats, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const launched = snapshot.protocols.filter(isComparable);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by implied value, capped.
  // Scored with the same function as the watchlist, so a growing smaller protocol can outrank a
  // flat larger one. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, fit, model).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    return { p, ...v };
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
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_value_usd: s.base,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
      band_low_usd: s.bandLow,
      band_high_usd: s.bandHigh,
    },
    comparables: comparablesFor(s.p, launched),
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

/** All chains a protocol runs on, as one short phrase. */
function chainsOf(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  if (p.chains.length === 1) return p.chains[0]!;
  return `${p.chains[0]} and ${p.chains.length - 1} more chain${p.chains.length - 1 === 1 ? '' : 's'}`;
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
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas a weekly action costs on the protocol's main chain, as a rough band. */
function gasFor(p: SnapshotProtocol): string {
  const c = chainOf(p).toLowerCase();
  if (c.includes('ethereum')) return 'about $4 of gas';
  if (c.includes('solana') || c.includes('base') || c.includes('arbitrum') || c.includes('optimism')) return 'under $1 of gas';
  return 'about $2 of gas';
}

/**
 * The category's two actions: the opening position and the weekly qualifying action. Both are
 * derived from the protocol's own record (category, chains, TVL), never from a hand-written list
 * of names.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { open: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const gas = gasFor(p);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      open: `Supply $${capital} of USDC to ${name} on ${chain} and borrow a small amount against it, keeping the health factor above 2.`,
      weekly: `Repay part of the borrow, top the supply back up, or adjust the collateral on ${name} so the position stays active.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return {
      open: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small position, hedged or sized under 10% of the deposit.`,
      weekly: `Close and reopen a small position on ${name}, or add margin, so the account shows fresh trading activity.`,
    };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return {
      open: `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in one app on the destination chain.`,
      weekly: `Bridge a smaller amount back or across again through ${name}, and use the funds rather than leaving them idle.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      open: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`,
      weekly: `Restake the rewards, or add a small top-up to the stake on ${name}, and keep the receipt in the farming wallet.`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm')) {
    return {
      open: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, in a range or pair the pool already trades.`,
      weekly: `Swap a small amount through ${name}'s pool, or rebalance the position, so the wallet shows trading as well as liquidity.`,
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('curator') || c.includes('allocator')) {
    return {
      open: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the farming wallet.`,
      weekly: `Harvest the vault's yield, or move the position into the vault's newest strategy on ${name}, and record the change.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      open: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`,
      weekly: `Check the asset's yield accrual on ${name} and add a small top-up, keeping the whole position in one wallet.`,
    };
  }
  if (c.includes('stable')) {
    return {
      open: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`,
      weekly: `Use the stable asset once a week on ${name}, such as a deposit, a swap or a transfer, so the position is not idle.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      open: `Fund $${capital} on ${name} on ${chain} and place one market position with a small stake.`,
      weekly: `Settle one position and open another on ${name}, keeping the stake small and the activity regular.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      open: `Buy $${capital} of cover from ${name} on ${chain} for a position you already hold, and keep the policy in the farming wallet.`,
      weekly: `Check the policy's status on ${name} and, if a new cover round opens, renew or extend it with a small amount.`,
    };
  }
  if (c.includes('payment')) {
    return {
      open: `Route $${capital} of payments through ${name} on ${chain} from the farming wallet, and keep the receipts.`,
      weekly: `Send one more payment through ${name} each week, so the wallet shows repeated use rather than a single transfer.`,
    };
  }
  if (c.includes('governance')) {
    return {
      open: `Deposit $${capital} into ${name}'s governance position on ${chain} and keep the voting power in the farming wallet.`,
      weekly: `Vote on one open proposal on ${name} each week, or delegate the voting power and record the choice.`,
    };
  }
  if (c.includes('chain')) {
    return {
      open: `Use $${capital} across ${name}'s own apps on ${chain}: one deposit, one swap and one transfer in the same week.`,
      weekly: `Repeat one on-chain action on ${name} each week, alternating between its apps so the wallet's history is varied.`,
    };
  }
  return {
    open: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open in the farming wallet.`,
    weekly: `Make one qualifying action each week on ${name}, such as a deposit, a swap or a vote, and keep the position funded.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Two steps are category-specific, the rest are sized by the protocol's TVL and age.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chains = chainsOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const { open, weekly } = actionsFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chains}, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: open,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, open ${p.name}'s own points or rewards page and check the position is credited, using only the link the protocol itself publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a month',
    },
    {
      text: `If the protocol issues a token, claim only from its own announcement and move the claim to a separate wallet before selling anything.`,
      cost: 'one claim transaction',
      time: '15 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
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

/** A board row's compact form for data.js. */
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
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_value_usd: row.model.base_value_usd,
    band_low_usd: row.model.band_low_usd,
    band_high_usd: row.model.band_high_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    comparables: row.comparables,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitValueModel(snapshot, model);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
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
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
