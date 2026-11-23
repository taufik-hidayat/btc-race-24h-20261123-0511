# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/taufik-hidayat/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/taufik-hidayat/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Ridge — a long-only cbBTC bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty ($50 USDC). It trades Coinbase Wrapped BTC against USDC on 1-minute on-chain bars with $1,000 of paper money, in the `agent-fun/bars-replay/v1` harness.

## Strategy

Sit in cash through chop and falling markets; buy only on a clear signal; let a wide profit target plus a trailing stop do the selling. Two independent entry signals:

- **Trend turn** — the 16-minute EMA crosses back above the 120-minute EMA. Entries only start at bar 60, so the slow EMA has real history behind it.
- **Washout** — the close is at least 150 bps below where it was 4 hours ago *and* within 40 bps of its own 30-minute low (a sharp multi-hour drop that has stopped falling).

Exits, whichever comes first: +400 bps profit target, −150 bps hard stop, or a 150 bps trailing stop under the best close since entry (only while in profit). No exit on the EMA crossing back — on 1-minute bars the cross flips in noise and whipsaws a bot out of good trends. One position at a time, full cash per trade, no entries in the final 60 bars. Fully deterministic: a pure function of the closes seen so far — no clock, no randomness, no network.

## Dev-window backtest (1,440 1-minute bars, kit dataset)

| | Net PnL | Trades | Max drawdown |
|---|---:|---:|---:|
| **Ridge** | **+$39.33** | **3** | **1.58%** |
| buy-and-hold | +$31.73 | 1 | 3.25% |
| hold-cash | $0.00 | 0 | 0.00% |

Backtested with a local replay implementing the harness's exact fill model (fee 4 bps, slippage 2 bps, constant-product impact against each bar's pool depth); the bot's run is deterministic — two runs produce byte-identical replies. Out-of-sample sanity: the same parameters lose only −$18.13 on the falling 20261118 dev window (buy-and-hold −$31.41 there) and −$0.39 on the choppy 20261117 window.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` on stdin/stdout (newline-delimited JSON), using the vendored `vendor/makefun-bars.ts` shim. Node 22+ with erasable-TypeScript support; stdlib only, no dependencies, no network, no API keys.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2z9vc20p&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
