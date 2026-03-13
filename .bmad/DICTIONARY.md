# PROJECT DICTIONARY

> Định nghĩa thuật ngữ riêng của dự án.
> Mục đích: AI không bao giờ đoán mò ý nghĩa.
> Cập nhật bởi: Master-Agent + Human

## Thuật ngữ dự án

| Term | Definition | Context |
|------|-----------|---------|
| `regime` | Trạng thái thị trường: 0-3 score (staircase + volume + volatility) | Momentum strategy |
| `staircase` | Pattern giá grinding từ từ (HH/HL hoặc LL/LH, pullback nhỏ) | Regime detection |
| `insider score` | Composite score 0-100 từ 5 components (A-E) × multiplier | Insider scanner |
| `suspect` | Wallet đã bị flag với insiderScore > 0 | Insider scanner |
| `large trade` | Trade vượt tier threshold (dynamic per coin) | Insider scanner |
| `mega trade` | Trade > megaTradeUsd (default $1M) | Insider scanner |
| `ghost wallet` | Deposit-only, ≤5 fills, age < 14d | Wallet classification |
| `one-shot` | ≤2 deposits, ≤3 fills, age < 7d | Wallet classification |
| `GSD` | Get Shit Done — làm ngay nếu task < 15 min | BMAD workflow |
| `DoD` | Definition of Done — tiêu chí hoàn thành task | BMAD workflow |
| `R` | Risk unit — khoảng cách entry→SL = 1R | Position sizing |
| `regime score` | 0/3 (no trend) → 3/3 (strong: staircase + vol + ATR) | Signal quality |
| `candle pipeline` | Scanner → WS subscribe → regime classify → signal generate → execute | Momentum bot |
| `szDecimals` | Hyperliquid per-asset size decimal precision | Order rounding |
| `HFT filter` | userFees API `userAddRate <= 0` → market maker, skip inspection | Insider scanner |
| `Copin profile` | Behavioral classification from Copin Analyzer: ALGO_HFT/SMART_TRADER/DEGEN/INSIDER_SUSPECT | Insider scanner |

## Abbreviations

| Abbr | Full | Notes |
|------|------|-------|
| HL | Hyperliquid | DEX |
| SL | Stop Loss | |
| TP | Take Profit | |
| ATR | Average True Range | Volatility indicator |
| OI | Open Interest | |
| WS | WebSocket | |
| MM | Market Maker | |
| HFT | High-Frequency Trading | |
| DI | Dependency Injection | NestJS pattern |
| IOC | Immediate or Cancel | Order type |
| GTC | Good Till Cancel | Order type |
| FP | False Positive | Detection quality |

---
*Append new terms as they arise. Never rewrite entire file.*
