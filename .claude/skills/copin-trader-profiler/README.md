# copin-trader-profiler

Analyze and classify perp DEX traders using Copin Analyzer data.

## Quick Start
```bash
"Find smart traders on Hyperliquid in the last 30 days"
"Profile trader 0xABCD1234 on Hyperliquid — full classification"
"Find suspicious insider-like traders — high win rate, few trades"
"Detect algo/MM/HFT traders on Hyperliquid"
"Who are the most copy-worthy traders this month?"
"Find sniper traders — few trades but massive ROI"
```

## Architecture
**Type:** Pipeline (collect → classify → fingerprint → report)
**Complexity:** 17/20

## 8 Trader Archetypes

| Archetype | Key Signals | Copin Filters |
|-----------|-------------|---------------|
| 🧠 Smart Trader | Consistent profit, good risk mgmt | WR≥55%, PL ratio≥1.5, DD≥-30% |
| 🕵️ Insider | Few trades, extreme win rate, fast | WR≥80%, trades≤20, ROI≥30% |
| 🤖 Algo/MM/HFT | High frequency, balanced, tight risk | trades≥200, dur≤1h, long 40-60% |
| 🎯 Sniper | Few but precise, massive ROI | trades≤30, maxROI≥100%, WR≥70% |
| 🎰 Degen | High leverage, frequent liquidations | lev≥30x, liqs≥3, DD≤-50% |
| 📊 Sense Trader | Directional, medium freq, intuition | long≥70%/≤30%, WR≥55%, holds 1h-7d |
| 💎 Diamond Hands | Low freq, high conviction, long hold | avgDur≥7d, trades≤30, lev≤10x |
| 🔄 Copy-Worthy | Optimized for copy trading | Composite of 8 weighted factors |

## Copin API Endpoints Used

1. `POST /public/HYPERLIQUID/position/statistic/filter` — Trader statistics with 30+ filter fields
2. `POST /HYPERLIQUID/position/filter` — Individual positions by wallet
3. `GET /HYPERLIQUID/position/detail/{id}` — Position with all orders
4. `GET /leaderboards/page` — Weekly/monthly rankings
5. `POST /HYPERLIQUID/top-positions/opening` — Current open interest

## Output
- `data/analysis/traders/{wallet}.json` — Classification + fingerprint
- `reports/traders/{type}_{YYMMDD}.md` — Human-readable reports
- `data/analysis/traders/mm_hft_whitelist.json` — MM/HFT wallets for insider-detector exclusion

## Integration with Other Skills
- **insider-detector**: Copin data enriches insider detection. MM/HFT whitelist reduces false positives.
- **alpha-backtester**: Smart trader positions can seed strategy ideas.
- **perp-analytics**: Whale positions from Copin OI feed into market analysis.
