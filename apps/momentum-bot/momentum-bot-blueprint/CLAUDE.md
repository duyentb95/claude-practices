# CLAUDE.md — Momentum Trading Bot

## Project Overview

Automated momentum breakout trading bot for Hyperliquid perpetual DEX.
Strategy: codified from "Spicy" Momentum Trading Guide (100 pages).
Core principle: Regime detection FIRST, trade execution SECOND.

## Architecture

Hybrid stack: Rust core engine + TypeScript/NestJS monitoring.

```
crates/data/       → WS feed, candle aggregation, orderbook, volume
crates/strategy/   → Regime detector, swing finder, entry/SL/TP logic, scanner
crates/execution/  → Hyperliquid orders, EIP-712 signing, risk manager
crates/bot/        → Main binary, config loader, trade journal
monitoring/        → NestJS dashboard (integrate into existing monorepo)
```

## Strategy Summary (Read docs/STRATEGY.md for full rules)

**3 Variables for regime detection:**
1. Grindy Staircase (highest priority) — trending HH/HL or LL/LH, small pullbacks
2. Increasing Volume — each 30min quarter should show higher avg volume
3. High Volatility — current ATR > 1.5x 24h baseline

**Entry**: After 1 candle close through swing high/low. Limit order if SL < 3%, market order if ≥ 3%.
**Stoploss**: At relevant swing point on opposite side. ALWAYS placed immediately.
**Target**: Next swing level (1R-1.5R), or trailing SL for 3/3 regime and ATH breakouts.
**Risk**: Max 2% per trade, max 3 positions, daily -5% halt, -15% drawdown kill switch.

## Key Files

| File | Purpose |
|------|---------|
| `docs/PLAN.md` | Full project plan, tech stack, phases |
| `docs/STRATEGY.md` | Codified strategy rules (machine-readable) |
| `config/default.toml` | All configurable parameters |
| `.claude/skills/regime-detector/` | Regime detection skill |
| `.claude/skills/momentum-scanner/` | Coin scanning skill |
| `.claude/skills/momentum-executor/` | Trade execution skill |

## Hyperliquid API

```
REST (read):  POST https://api.hyperliquid.xyz/info
REST (write): POST https://api.hyperliquid.xyz/exchange (EIP-712 signed)
WebSocket:    wss://api.hyperliquid.xyz/ws

Key WS subscriptions:
  l2Book, trades, candle (1m), userFills, orderUpdates

Order signing: EIP-712 phantom agent, msgpack + keccak256 + ethers.signTypedData
Price rounding: 5 significant digits, max(0, 6 - szDecimals) decimal places
```

## Commands

```bash
# Build
cargo build --release

# Run (paper trading mode)
PAPER_TRADE=true cargo run --bin momentum-bot

# Run (live)
cargo run --bin momentum-bot

# Run monitoring dashboard
cd monitoring && npm run start:dev
```

## Environment Variables

```
HYPERLIQUID_API_KEY=0x...
HYPERLIQUID_SECRET_KEY=0x...
HYPERLIQUID_VAULT_ADDRESS=        # Optional
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://localhost/momentum_bot
LARK_WEBHOOK_URL=https://...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
PAPER_TRADE=true                  # Set to false for live trading
```

## Development Rules

- **Rust code**: Use `rust_decimal` for ALL financial calculations. No f64 for prices/sizes.
- **Error handling**: Use `anyhow` for application errors, `thiserror` for library errors.
- **Testing**: Every strategy component needs unit tests with known-good/bad scenarios from the PDF.
- **Logging**: Use `tracing` with structured fields. Every order action must be logged.
- **Config**: Hot-reload from Redis. TOML file for defaults.
- **Safety**: NEVER remove risk limits. They are non-negotiable.

## Agent Skills

Skills in `.claude/skills/` define the bot's intelligence:
- **regime-detector**: Scores 3 variables, classifies regime (most critical)
- **momentum-scanner**: Finds coins with momentum setups
- **momentum-executor**: Handles entry/exit with safety checks

When building or modifying any component, ALWAYS refer to `docs/STRATEGY.md` for the rules.
The strategy document is the source of truth.
