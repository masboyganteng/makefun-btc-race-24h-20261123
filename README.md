# Quiet Dip-Bounce — BTC 24h Race Bot

![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)
![Rank](https://make.fun/badge/btc-race-24h-20261123-0511/masboyganteng/makefun-btc-race-24h-20261123/rank.svg)
![Reward](https://make.fun/badge/btc-race-24h-20261123-0511/masboyganteng/makefun-btc-race-24h-20261123/reward.svg)

A trading bot for the make.fun competition `btc-race-24h-20261123-0511`:
race a BTC (cbBTC/USDC) trading bot live for 24 hours on $1,000 of paper
money. Long only, at most one position, at most 16 orders per reply.

## Strategy

**Almost always flat. One good bounce, or nothing.**

The final leaderboards of the three finished 24h BTC races (0828, 0603,
1444) all tell the same story: every top-10 bot was a dip buyer that made
1–4 trades and won by catching a single washout bounce (top-10 net PnL
roughly +$14 to +$24 on $1,000). Our own earlier bots lost by doing the
opposite — over-trading a dev window (22 trades, live −$22.60). So this
bot trades rarely and only on a high-conviction setup:

- **Entry** — all of these on a bar's close: price ≥ 1.2% below the
  120-bar rolling high; price no more than 1.0% below the 120-bar SMA
  (never buy a strong downtrend); close ≥ 0.40% above the 5-bar low;
  2 consecutive up closes **and** close back above the 10-bar SMA (the
  short-term trend has visibly flipped up). Then one full-size buy.
  At most 3 round trips per 24h window, at least 240 bars between trades.
- **Exit** — take profit +3.0%, stop loss −1.5%, or time exit after 420
  bars held if in profit (≥ +0.3%). Everything still held at the end is
  flattened by the harness.

## Backtests (real harness, `grade-local`, all four published dev windows)

| Window | Net PnL | Filled orders | Max drawdown |
| ------ | ------: | ------------: | -----------: |
| 0511 (this competition's dev) | +$2.53 | 2 | 1.27% |
| 0828 | +$11.91 | 4 | 2.57% |
| 0603 | +$10.68 | 2 | 0.68% |
| 1444 | +$15.35 | 2 | 0.65% |

Median +$11.29, worst window +$2.53, max drawdown under 3% everywhere.
The dev gate (+$2.53 > $0) passes with margin. Two executions on the
same data reproduce the action log byte for byte (deterministic).

## Honest expectation

No rank can be guaranteed — the race window is 24 hours of prices
nobody has seen, and the winning margin in past races was only about
+$15–$25. What this bot offers is a robust profile: it only trades the
kind of washout bounce that won the last three races, keeps drawdown
small, and stays out of the market the rest of the time. If the race
window has no qualifying dip, it will simply stay flat and score $0.

## Running

Node 22, standard library only:

```sh
node main.ts   # speaks agent-fun/bars-replay/v1 on stdin/stdout
```

## License

MIT — see [LICENSE](LICENSE).
