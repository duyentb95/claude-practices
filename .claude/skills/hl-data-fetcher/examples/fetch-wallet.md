# Example — Single Wallet Inspection

Full walkthrough: inspect wallet `0x6b9e...` for insider-scanner pipeline.

---

## Input

```
Task: Inspect wallet 0x6b9e4f2a...d8c1 — suspicious large BTC trade detected via WebSocket.
```

---

## Step 1 — MM/HFT Check

```typescript
const fees = await postInfo({ type: 'userFees', user: '0x6b9e...' });
// fees.userAddRate = "0.000250"  → positive → NOT a market maker → proceed
```

Result: `userAddRate = 0.000250` — taker fee, not MM. Continue inspection.

---

## Step 2 — Ledger History

```typescript
const ledger = await postInfo({
  type: 'userNonFundingLedgerUpdates',
  user: '0x6b9e...',
});
```

Response (abbreviated):
```json
[
  {
    "delta": { "type": "deposit", "usdc": "250000" },
    "time": 1709598000000,
    "hash": "0xabc..."
  }
]
```

Analysis:
- 1 deposit entry only → `isDepositOnly = true`
- Deposit: $250,000 USDC at `T=1709598000000` (10:00:00 UTC+7)
- No withdrawals, no sends → `DEP_ONLY` flag

---

## Step 3 — Paginated Fills

```typescript
const fills = await getUserFillsPaginated('0x6b9e...', 10_000);
// Page 1: 147 fills returned (< 2000) → no more pages
```

Response (abbreviated):
```json
[
  {
    "coin": "BTC",
    "px": "95230.5",
    "sz": "1.2",
    "side": "B",
    "time": 1709598900000,
    "closedPnl": "0",
    "fee": "28.6",
    "oid": 88812345,
    "tid": 12345678
  },
  ...
]
```

Analysis:
- Total fills: 147 (all-time)
- Trade detected: BTC BUY 1.2 @ 95,230.5 = **$114,276** at `T=1709598900000` (10:15:00 UTC+7)
- Gap: 10:15 − 10:00 = **15 minutes** after deposit
- 90d fills: 0 (wallet just created)
- All-time closed PnL: $0 (all open)

---

## Step 4 — Account State

```typescript
const state = await postInfo({ type: 'clearinghouseState', user: '0x6b9e...' });
```

Response (abbreviated):
```json
{
  "marginSummary": {
    "accountValue": "248500",
    "totalNtlPos": "570000",
    "totalMarginUsed": "240000"
  },
  "assetPositions": [{
    "position": {
      "coin": "BTC",
      "szi": "1.2",
      "entryPx": "95230.5",
      "positionValue": "114276",
      "marginUsed": "110000",
      "liquidationPx": "88000"
    },
    "type": "oneWay"
  }]
}
```

Analysis:
- Account value: $248,500
- Margin used: $240,000 / $248,500 = **96.6%** → `ALL_IN` flag
- Implied leverage: $114,276 / $248,500 = **0.46×** (low but all-in on margin)

---

## Step 5 — Score Computation

```
A (deposit speed):   22 pts  (15 min gap)
B (freshness):       18 pts  (0 fills 90d +10, 0 age +8, allTimePnl=0 +0)
C (market ratio):    12 pts  ($114K / $1.2B BTC vol = 0.0095% → +0; OI ratio +3; size tier ok)
D (concentration):   12 pts  (marginUtil 96.6% → +8 ALL_IN; margin/deposit 96% → +4)
E (ledger purity):    8 pts  (isDepositOnly → +5; deposit-only ledger → +3)

Sum A+B+C+D+E = 72
Multiplier:
  hasImmediate = false (22 < 22... borderline, use exact threshold)
  hasFreshWallet = true (0 fills90d)
  hasAllIn = true
  → hasFreshWallet + hasAllIn not in combos; check: hasFreshWallet + hasDeadMarket = no
  → multiplier = 1.0

Final score = min(100, round(72 × 1.0)) = 72 → HIGH 🟠
```

(In production, the exact score depends on live market context from `metaAndAssetCtxs`.)

---

## Output

```json
{
  "address": "0x6b9e...",
  "insiderScore": 72,
  "alertLevel": "HIGH",
  "walletType": "GHOST",
  "depositToTradeGapMs": 900000,
  "flags": ["DEP_ONLY", "ALL_IN", "FRESH_DEP", "NEW_ACCT"],
  "profile": {
    "walletAge": 0,
    "fillCount90d": 0,
    "allTimeFills": 147,
    "accountValue": 248500
  }
}
```

Saved to: `data/raw/wallets/0x6b9e.../`
- `ledger.json` — raw ledger response
- `fills.json` — all 147 fills
- `state.json` — clearinghouse state
