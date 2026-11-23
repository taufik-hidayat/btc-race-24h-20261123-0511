// Ridge — a long-only cbBTC bot for make.fun's "Race a BTC trading bot live for 24 hours"
// (btc-race-24h-20261123-0511, bars-replay/v1, $1,000 paper USDC).
//
// Idea: sit in cash through chop and falling markets, buy only on a clear signal,
// then let a wide profit target plus a trailing stop do the selling. Two
// independent entry signals, one position at a time, full cash per trade:
//
//   - Trend turn: the 16-minute EMA crosses back above the 120-minute EMA.
//     Entries only start at bar 60, so the slow EMA has real history behind it,
//     and stop at bar 1379 (no entries in the final 60 bars).
//   - Washout: the close is at least 150 bps below where it was 4 hours ago
//     AND within 40 bps of its own 30-minute low (a sharp multi-hour drop that
//     has stopped falling).
//
// Exits, whichever comes first: +400 bps profit target, -150 bps hard stop, or
// a 150 bps trailing stop under the best close since entry (only while in
// profit). No exit on the EMA crossing back: on 1-minute bars the cross flips
// in noise and whipsaws a bot out of good trends.
//
// Fully deterministic: a pure function of the closes seen so far. No clock,
// no randomness, no network, no environment. Money math in bigint quote units;
// signal math in float64, in a fixed order, so two runs agree bit for bit.

import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, Batch } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";

// Strategy constants (all in 1-minute bars / basis points).
const FAST_EMA = 16;
const SLOW_EMA = 120;
const MIN_ENTRY_BAR = 60; // entries only once the slow EMA has real history
const LAST_ENTRY_BAR = 1379; // no entries in the final 60 bars (window: 1440)
const WASHOUT_LOOKBACK = 240; // 4 hours
const WASHOUT_DROP_BPS = 150;
const WASHOUT_LOW_WINDOW = 30;
const WASHOUT_LOW_TOL_BPS = 40;
const PROFIT_TARGET_BPS = 400;
const HARD_STOP_BPS = 150;
const TRAILING_STOP_BPS = 150;
const MAX_SLIPPAGE_BPS = 300; // a 1-minute move over 3% rejects the order

const alpha = (n: number): number => 2 / (n + 1);

class Ridge {
  private closes: number[] = [];
  private emaFast = 0;
  private emaSlow = 0;
  private prevFast = 0;
  private prevSlow = 0;
  private bestClose = 0; // best close since entry, raw price units

  onBatch(state: BarsState, batch: Batch) {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const c = Number(close);
    const seq = state.seq;

    // Fold the new close into both EMAs (seeded at the first close).
    if (this.closes.length === 0) {
      this.emaFast = c;
      this.emaSlow = c;
    } else {
      this.prevFast = this.emaFast;
      this.prevSlow = this.emaSlow;
      this.emaFast = this.emaFast + alpha(FAST_EMA) * (c - this.emaFast);
      this.emaSlow = this.emaSlow + alpha(SLOW_EMA) * (c - this.emaSlow);
    }
    this.closes.push(c);

    // The harness flattens everything on the last batch; never order there.
    if (seq >= 1439 || state.warmingUp) return [];

    const pos = state.positions.get(SYMBOL);
    const qty = pos?.qty ?? 0n;

    // --- exits ---
    // Sell on the first of: profit target, hard stop, or trailing stop.
    // The trailing stop only arms while the trade is in profit, so a fresh
    // entry is never shaken out by the first down-tick; the best close is
    // tracked from the closes seen while holding (updated below).
    if (qty > 0n) {
      const cost = pos!.cost;
      const value = state.value(SYMBOL, qty);
      const retBps = ((Number(value) - Number(cost)) / Number(cost)) * 10000;
      const trailBps = ((this.bestClose - c) / c) * 10000;
      const exitNow =
        retBps >= PROFIT_TARGET_BPS ||
        retBps <= -HARD_STOP_BPS ||
        (retBps > 0 && trailBps >= TRAILING_STOP_BPS);
      if (exitNow) {
        return [
          {
            side: "sell",
            symbol: SYMBOL,
            qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }
      if (c > this.bestClose) this.bestClose = c;
      return [];
    }

    // --- entries ---
    if (seq < MIN_ENTRY_BAR || seq > LAST_ENTRY_BAR) return [];
    if (state.cash < 1_000_000n) return []; // below the $1 minimum notional

    const crossUp =
      this.closes.length > 1 &&
      this.emaFast > this.emaSlow &&
      this.prevFast <= this.prevSlow;

    let washout = false;
    if (seq >= WASHOUT_LOOKBACK) {
      const dropBps =
        ((c - this.closes[seq - WASHOUT_LOOKBACK]) /
          this.closes[seq - WASHOUT_LOOKBACK]) *
        10000;
      let low = Infinity;
      for (let i = seq - WASHOUT_LOW_WINDOW + 1; i <= seq; i++) {
        if (this.closes[i] < low) low = this.closes[i];
      }
      const nearLowBps = ((c - low) / low) * 10000;
      washout = dropBps <= -WASHOUT_DROP_BPS && nearLowBps <= WASHOUT_LOW_TOL_BPS;
    }

    if (crossUp || washout) {
      this.bestClose = c;
      return [
        {
          side: "buy",
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  }
}

const bot = new Ridge();
await runBars({ onBatch: (state, batch) => bot.onBatch(state, batch) });
