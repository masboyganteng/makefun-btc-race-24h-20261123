// Quiet Dip-Bounce bot for btc-race-24h-20261123-0511.
//
// Idea, learned from the final leaderboards of the three finished 24h BTC
// races (0828, 0603, 1444): every top-10 bot was a dip buyer that made 1-4
// trades and won by catching ONE washout bounce, not by trading often.
// Our own earlier bots lost by over-trading a dev window (22 trades, live
// -22.60 USDC). So this bot is almost always flat: it only buys a deep dip
// after the short-term trend has visibly flipped back up, holds for the
// recovery, and otherwise does nothing.
//
// Entry (all conditions must hold on a bar's close):
//   * at least 120 bars of history, not in warmup, flat, < 3 trades so far,
//     >= 240 bars since the last trade (cooldown)
//   * dip: close >= 1.2% below the 120-bar rolling high
//   * regime: close no more than 1.0% below the 120-bar SMA (never buy a
//     strong downtrend)
//   * bounce: close >= 0.40% above the 5-bar low
//   * momentum flip: 2 consecutive up closes AND close >= 10-bar SMA
//   * buy 100% of cash in one order
// Exit (on a later bar's close, fills at the next bar's open):
//   * take profit +3.0% from the fill price, or
//   * stop loss -1.5% from the fill price, or
//   * time exit after 420 bars held with gain >= +0.3%
// The end-of-window flatten is left to the harness.
//
// The bot is deterministic: every decision is a pure function of the bars
// seen so far (integer bigint arithmetic only). No clock, no randomness,
// no environment. It speaks agent-fun/bars-replay/v1: the harness sends a
// hello once, then one batch per minute (one 1-minute bar of CBBTC, the
// fills of the previous batch's orders and the account); the bot answers
// each batch with exactly one reply echoing the batch number.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Strategy constants (percentages in basis points, 100 bps = 1%).
const LOOKBACK = 120; // bars for the rolling high and the long SMA
const DIP_BPS = 120; // buy only >= 1.2% below the 120-bar high
const REGIME_BPS = 100; // close at most 1.0% below the 120-bar SMA
const BOUNCE_BPS = 40; // close >= 0.40% above the 5-bar low
const UP_CLOSES = 2; // consecutive rising closes confirming the flip
const TAKE_PROFIT_BPS = 300; // +3.0% from the fill price
const STOP_LOSS_BPS = 150; // -1.5% from the fill price
const TIME_EXIT_BARS = 420; // give a recovery up to 7 hours
const TIME_EXIT_MIN_GAIN_BPS = 30; // ... but only exit late if in profit
const MAX_TRADES = 3; // hard cap on round trips per 24h window
const COOLDOWN_BARS = 240; // at least 4 hours between trades
const MAX_SLIPPAGE_BPS = 300; // 3%: generous, 1-minute moves are tiny

// Integer helpers: all prices are bigints in 1e-5 USD units.
function bpsBelow(high: bigint, price: bigint): bigint {
  // How far price sits below high, in basis points.
  return ((high - price) * 10000n) / high;
}
function bpsAbove(low: bigint, price: bigint): bigint {
  return ((price - low) * 10000n) / low;
}
function sma(values: bigint[]): bigint {
  let sum = 0n;
  for (const v of values) sum += v;
  return sum / BigInt(values.length);
}

const closes: bigint[] = [];
const highs: bigint[] = [];
const lows: bigint[] = [];

let trades = 0;
let lastTradeSeq = -100000;
let entryPrice: bigint | null = null; // fill price of the open position
let entrySeq = -1;
let pendingBuyId: string | null = null;
let pendingSellId: string | null = null;

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return []; // minute with no bar: stay quiet

    const close = BigInt(bar.c);
    closes.push(close);
    highs.push(BigInt(bar.h));
    lows.push(BigInt(bar.l));

    // Learn the fill prices of our own orders from this batch's fills.
    for (const fill of batch.fills) {
      if (fill.status !== 'filled') continue;
      if (fill.client_id === pendingBuyId) {
        entryPrice = BigInt(fill.price);
        entrySeq = batch.seq;
        pendingBuyId = null;
        trades++; // count the round trip only once the buy actually fills
      } else if (fill.client_id === pendingSellId) {
        entryPrice = null;
        entrySeq = -1;
        pendingSellId = null;
      }
    }

    const pos = state.positions.get(SYMBOL);
    const holding = pos !== undefined && pos.qty > 0n;
    if (state.warmingUp) return []; // never trade during warmup bars

    // ---- exit: we hold a position -------------------------------------
    if (holding && entryPrice !== null) {
      const gainBps = ((close - entryPrice) * 10000n) / entryPrice;
      const heldBars = batch.seq - entrySeq;
      const takeProfit = gainBps >= BigInt(TAKE_PROFIT_BPS);
      const stopLoss = gainBps <= -BigInt(STOP_LOSS_BPS);
      const timeExit =
        heldBars >= TIME_EXIT_BARS && gainBps >= BigInt(TIME_EXIT_MIN_GAIN_BPS);
      if (takeProfit || stopLoss || timeExit) {
        const id = state.clientId();
        pendingSellId = id;
        lastTradeSeq = batch.seq;
        return [
          {
            side: 'sell',
            symbol: SYMBOL,
            qty: pos.qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: id,
          },
        ];
      }
      return [];
    }

    // ---- entry: flat, wait for the one good setup ---------------------
    if (holding) return []; // fill not reported yet: wait for the price
    if (trades >= MAX_TRADES) return [];
    if (batch.seq - lastTradeSeq < COOLDOWN_BARS) return [];
    if (closes.length < LOOKBACK) return [];

    const windowHighs = highs.slice(-LOOKBACK);
    let rollingHigh = windowHighs[0]!;
    for (const h of windowHighs) if (h > rollingHigh) rollingHigh = h;
    if (bpsBelow(rollingHigh, close) < BigInt(DIP_BPS)) return [];

    const smaLong = sma(closes.slice(-LOOKBACK));
    if (bpsBelow(smaLong, close) > BigInt(REGIME_BPS)) return [];

    const low5 = lows.slice(-5).reduce((a, b) => (a < b ? a : b));
    if (bpsAbove(low5, close) < BigInt(BOUNCE_BPS)) return [];

    let upRun = 0;
    for (let i = closes.length - 1; i >= 1 && upRun < UP_CLOSES; i--) {
      if (closes[i]! > closes[i - 1]!) upRun++;
      else break;
    }
    if (upRun < UP_CLOSES) return [];

    const smaShort = sma(closes.slice(-10));
    if (close < smaShort) return []; // trend has not flipped back up

    // All filters passed: one full-size buy at the next bar's open.
    if (state.cash <= 0n) return [];
    const id = state.clientId();
    pendingBuyId = id;
    lastTradeSeq = batch.seq;
    return [
      {
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: state.cash,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
        client_id: id,
      },
    ];
  },
});
