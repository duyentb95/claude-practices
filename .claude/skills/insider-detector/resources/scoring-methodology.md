# Insider Detection Scoring Methodology

## Composite Score Formula

```
total_score = Σ(factor_score_i × weight_i)
```

## Factor Definitions

### 1. Pre-Event Accumulation (weight: 0.30)

**Rationale**: Insiders open positions before public announcements.

```python
for each trade on token:
    event = find_nearest_future_event(trade.time)  # listing, airdrop, param change
    delta = event.time - trade.time

    if 1h < delta < 48h and trade.usd_value > 10000:
        base = min(100, trade.usd_value / 1000)
        if delta < 4h:    score = base * 1.5
        elif delta < 12h: score = base * 1.2
        else:             score = base * 1.0
```

### 2. Volume Anomaly (weight: 0.20)

**Rationale**: Unusual volume precedes insider events.

```python
avg_7d = mean(daily_volume[-7:])
pre_event_vol = volume_24h_before_event

if avg_7d > 0:
    ratio = pre_event_vol / avg_7d
    score = min(100, (ratio - 1) * 33)  # 4x ratio → score 100
elif pre_event_vol > 5000:
    score = 90  # No history = very suspicious
```

### 3. Win Rate on New Listings (weight: 0.15)

**Rationale**: Consistent wins on new tokens suggests advance knowledge.

```python
new_tokens = tokens_listed_within_30_days
trades = filter(fills, token in new_tokens)
wins = count(trade.pnl > 0 for trade in trades)

if len(trades) >= 3:
    win_rate = wins / len(trades)
    score = min(100, max(0, (win_rate - 0.5) * 200))
else:
    score = 0  # Insufficient sample
```

### 4. Timing Precision (weight: 0.15)

**Rationale**: Insiders time trades with unusual accuracy.

```python
for each profitable trade:
    move_time = time_when_price_moved_5pct_in_direction - trade.time
    if move_time < 5min:   precision = 100
    elif move_time < 30min: precision = 70
    elif move_time < 2h:    precision = 40
    else:                   precision = 0

score = mean(precisions)
```

### 5. Wallet Clustering (weight: 0.10)

**Rationale**: Insiders use multiple wallets to obfuscate.

```python
for each pair (wallet_a, wallet_b):
    timing   = count(trades < 60s apart) / shared_trades  # weight 0.35
    size     = count(similar_size_5pct) / shared_trades    # weight 0.25
    direction = count(same_direction) / shared_trades      # weight 0.25
    behavior = cosine_similarity(fingerprint_a, fingerprint_b)  # weight 0.15

    confidence = timing*0.35 + size*0.25 + direction*0.25 + behavior*0.15
    if confidence > 0.6: cluster(a, b)

score = cluster_confidence * 100
if cluster_size > 3: score += 20
```

### 6. One-Shot Behavior (weight: 0.10)

**Rationale**: Insiders create disposable wallets for single operations.

```python
if total_trades < 5 and account_age < 7_days and max_trade > 10000:
    score = 90
elif total_trades < 10 and unique_tokens < 3:
    score = 50
else:
    score = 0
```

## Verdict Thresholds

| Score Range | Verdict | Action |
|-------------|---------|--------|
| ≥ 80 | `high_confidence_insider` 🔴 | Generate alert report immediately |
| 60–79 | `likely_insider` 🟡 | Include in investigation report |
| 40–59 | `suspicious` 🟢 | Include in daily summary |
| < 40 | `low_risk` | Omit from reports |

## Known Limitations

- Cannot detect insider trading via OTC or off-chain agreements
- Funding rate manipulation detection not included (future version)
- Vault-based strategies may trigger false positives
- MM/HFT wallets should be filtered via Copin API or manual whitelist
