# Example — Market Snapshot

Daily market overview: top coins by volume, flagging anomalies.

---

## Input

```
Task: Generate today's market snapshot — top 20 coins, flag anomalies.
```

---

## Step 1 — Fetch Market Context

```typescript
const [meta, ctxs] = await postInfo({ type: 'metaAndAssetCtxs' });
const mids = await postInfo({ type: 'allMids' });
// Rate-limit: 1100ms between calls
```

---

## Step 2 — Build Coin List

```typescript
const coins = meta.universe.map((u, i) => {
  const ctx = ctxs[i];
  const vol24h    = parseFloat(ctx.dayNtlVlm);
  const oiUsd     = parseFloat(ctx.oiNtlVlm);
  const funding   = parseFloat(ctx.funding);   // hourly
  const fundingAnn = funding * 8760;

  return {
    rank:       0,           // will set after sort
    name:       u.name,
    midPx:      parseFloat(mids[u.name] ?? ctx.midPx),
    vol24h,
    oiUsd,
    funding,
    fundingAnn,
    premium:    parseFloat(ctx.premium),
    tier:       getCoinTier(vol24h, u.name),
    flags:      [] as string[],
  };
});
```

---

## Step 3 — Flag Anomalies

```typescript
for (const c of coins) {
  if (Math.abs(c.fundingAnn) > 2.0)  c.flags.push('HIGH_FUNDING');
  if (c.vol24h < 500_000)            c.flags.push('DEAD_MARKET');
  if (Math.abs(c.premium) > 0.001)   c.flags.push('PREMIUM_DIVERGENCE');
  // OI_EXPANSION and VOL_SPIKE require historical baseline — skip in snapshot
}
```

---

## Step 4 — Sort & Rank

```typescript
const top20 = coins
  .sort((a, b) => b.vol24h - a.vol24h)
  .slice(0, 20)
  .map((c, i) => ({ ...c, rank: i + 1 }));
```

---

## Step 5 — Output

**Console / report table:**

```
## Market Snapshot — 2026-03-05 10:00 UTC+7

| Rank | Coin  | Price      | 24h Vol     | OI (USD)   | Funding Ann | Flags            |
|------|-------|-----------|------------|-----------|------------|-----------------|
|    1 | BTC   | $95,230    | $4.2B      | $1.8B     | +8.8%      |                 |
|    2 | ETH   | $3,420     | $1.9B      | $820M     | +12.3%     |                 |
|    3 | SOL   | $185       | $980M      | $290M     | +18.6%     |                 |
|    4 | HYPE  | $24.5      | $420M      | $95M      | +87.6%     | HIGH_FUNDING    |
|    5 | WIF   | $2.10      | $380M      | $68M      | -24.3%     | HIGH_FUNDING    |
|  ... | ...   | ...        | ...        | ...       | ...        | ...             |
|   19 | BLUR  | $0.42      | $380K      | $85K      | +2.1%      | DEAD_MARKET     |
|   20 | GMX   | $28.3      | $290K      | $42K      | -1.8%      | DEAD_MARKET     |

### Summary
- Total 24h volume: $9.8B across 142 perps
- Top anomalies: HYPE (+87.6% ann funding), WIF (-24.3% ann)
- Dead markets: 23 coins with < $500K daily volume
- High-funding opportunities (> 50% ann): HYPE, PURR, FRIEND
```

**JSON output:**

```json
{
  "timestamp": 1709600000000,
  "date": "2026-03-05",
  "totalCoins": 142,
  "totalVol24h": 9800000000,
  "top20": [
    {
      "rank": 1,
      "name": "BTC",
      "midPx": 95230,
      "vol24h": 4200000000,
      "oiUsd": 1800000000,
      "fundingAnn": 0.088,
      "tier": "BLUECHIP",
      "flags": []
    }
  ],
  "anomalies": {
    "highFunding": ["HYPE", "WIF", "PURR"],
    "deadMarkets": ["BLUR", "GMX", ...],
    "premiumDivergence": []
  }
}
```

Saved to: `data/analysis/market/snapshot-20260305.json`

---

## Step 6 — Funding Screener (Optional Extension)

```typescript
// Top 10 funding opportunities
const fundingOpps = coins
  .filter(c => Math.abs(c.fundingAnn) > 0.5)  // > 50% annualized
  .sort((a, b) => Math.abs(b.fundingAnn) - Math.abs(a.fundingAnn))
  .slice(0, 10)
  .map(c => ({
    coin:     c.name,
    side:     c.fundingAnn > 0 ? 'SHORT pays LONG' : 'LONG pays SHORT',
    ann:      `${(c.fundingAnn * 100).toFixed(1)}%`,
    vol24h:   c.vol24h,
    oiUsd:    c.oiUsd,
  }));
```

```
### Funding Screener (> 50% annualized)

| Coin  | Ann Rate | Direction       | 24h Vol | OI     |
|-------|---------|----------------|---------|--------|
| HYPE  | +87.6%  | Short pays long | $420M  | $95M   |
| PURR  | +63.2%  | Short pays long | $28M   | $8M    |
| WIF   | -57.8%  | Long pays short | $380M  | $68M   |
```

Saved to: `reports/daily/20260305-funding.md`
