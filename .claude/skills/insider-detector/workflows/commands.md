# /scan-token

Scan a token for insider trading patterns around its listing or recent events.

**Usage:** `/scan-token TOKEN_NAME`

**Workflow:**
1. Fetch token metadata → find listing date
2. Collect all fills in 14-day window
3. Identify top 30 wallets by volume
4. Run 6-detector pipeline on each
5. Cluster analysis
6. Generate investigation report

---

# /investigate

Deep-dive investigation of a specific wallet.

**Usage:** `/investigate WALLET_ADDRESS`

**Workflow:**
1. Fetch full wallet history (fills, positions, funding)
2. Identify tokens traded → flag new listings
3. Find related wallets via clustering
4. Score with full pipeline
5. Generate investigation report with evidence chain

---

# /daily-report

Run daily scan across all Hyperliquid tokens.

**Usage:** `/daily-report`

**Workflow:**
1. Fetch metaAndAssetCtxs → detect new listings (48h)
2. For each new token: collect fills, identify early traders
3. Score all early traders
4. Generate daily summary report
