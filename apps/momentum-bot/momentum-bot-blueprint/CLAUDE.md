# CLAUDE.md — Momentum Bot Blueprint (DEPRECATED)

> **WARNING**: This directory contains the *original Rust blueprint* for the momentum bot.
> The actual implementation is **Python** at `apps/momentum-bot/src/`.
> Do NOT follow Rust/Cargo instructions below — they describe a project that was never built.
> Refer to `apps/momentum-bot/` root for the real bot code.

## What IS useful here

- `docs/STRATEGY.md` — Codified strategy rules from the Spicy PDF. **Still the source of truth** for regime detection, entry/exit rules, and risk management.
- `docs/PLAN.md` — Original project plan. Status tracking is outdated but architecture concepts are valid.
- `SIGNAL-INPUTS-BRAINSTORM.md` — Signal input ideas brainstorm.

## Actual Implementation (Python)

```
apps/momentum-bot/
├── src/
│   ├── main.py              # Bot entry point, TaskGroup orchestration
│   ├── config.py            # Pydantic config from config/default.yaml
│   ├── data/
│   │   ├── market_scanner.py    # REST scanner, ranks coins by momentum
│   │   ├── candle_store.py      # Rolling candle window per coin
│   │   ├── feeder.py            # WS client for live candle updates
│   │   ├── candle_bootstrap.py  # REST candleSnapshot → CandleStore
│   │   ├── candle_pipeline.py   # Orchestrates subscribe/unsub + signal eval
│   │   └── hl_info.py           # Hyperliquid Info API poller
│   ├── strategy/
│   │   ├── regime.py            # classify_regime() — 3-variable scorer
│   │   ├── staircase.py         # Staircase pattern detector
│   │   ├── volume_trend.py      # Volume trend analyzer
│   │   ├── swing_points.py      # Swing point detection
│   │   ├── signal.py            # generate_signal() — regime + breakout + SL/TP
│   │   └── models.py            # Candle, Signal, ManagedPosition dataclasses
│   ├── execution/
│   │   └── executor.py          # HyperliquidExecutor — async SDK wrapper
│   └── utils/
│       └── hl_helpers.py        # round_price, round_size, AssetMetaCache
├── config/default.yaml          # All configurable parameters
└── requirements.txt
```

## Commands

```bash
# Run (from apps/momentum-bot/)
python -m src.main

# With dry run
DRY_RUN=true python -m src.main
```
