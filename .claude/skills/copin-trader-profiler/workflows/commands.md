# /find-traders

Find and rank traders by archetype on a perp DEX.

**Usage:** `/find-traders ARCHETYPE on PROTOCOL`

**Examples:**
```
/find-traders smart on Hyperliquid
/find-traders insider on Hyperliquid
/find-traders algo on Hyperliquid
/find-traders copy-worthy on Hyperliquid
/find-traders sniper on Hyperliquid
/find-traders degen on Hyperliquid
```

---

# /profile-trader

Full behavioral profile and classification for a wallet.

**Usage:** `/profile-trader ADDRESS on PROTOCOL`

**Example:**
```
/profile-trader 0xABCD1234...5678 on Hyperliquid
```

Outputs: classification, scores, fingerprint, top trades, copy recommendation.

---

# /mm-whitelist

Generate MM/HFT whitelist for insider detection false positive reduction.

**Usage:** `/mm-whitelist PROTOCOL`

**Example:**
```
/mm-whitelist Hyperliquid
```

Outputs: `data/analysis/traders/mm_hft_whitelist.json`

---

# /compare-traders

Side-by-side comparison of 2 traders.

**Usage:** `/compare-traders ADDRESS_1 vs ADDRESS_2 on PROTOCOL`

Outputs: radar chart comparison, metric tables, behavioral differences.
