# /scan-token

Scan a token for insider trading patterns around its listing or recent events.

**Usage:** `/scan-token TOKEN_NAME`

**Workflow:**
1. Fetch token metadata → find listing date
2. Collect all fills in 14-day window
3. Identify top 30 wallets by volume
4. Run full scoring pipeline (A+B+C+D+E×F+G) on each + cluster check
5. Cluster analysis
6. Generate investigation report

---

# /investigate

Deep-dive investigation of a specific wallet.

**Usage:** `/investigate WALLET_ADDRESS`

**Workflow:**
1. Layer 0/1/2 filter (zero-address → userFees → Copin ALGO_HFT)
2. Fetch ledger → cluster check (scan send entries vs known suspects)
3. Fetch paginated fills (up to 10k orders, aggregateByTime: true)
4. Fetch clearinghouseState → margin + positions
5. Score with full pipeline (A+B+C+D+E×F+G + cluster boost)
6. Find related wallets → flag LINKED suspects
7. Generate investigation report with evidence chain

---

# /daily-report

Run daily scan across all Hyperliquid tokens.

**Usage:** `/daily-report`

**Workflow:**
1. Fetch `allPerpMetas` → detect new listings (48h); filter `isDelisted: true`
2. For each new token: collect fills, identify early traders
3. Score all early traders (full pipeline)
4. Generate daily summary report

---

# Documentation Policy

**REQUIRED after every requirement, logic change, or code change:**

After completing any change to the insider-scanner codebase, you MUST update all of the following before considering the task done:

| Document | What to update |
|----------|---------------|
| `CHANGELOG.md` | Add semver entry with date, Added/Changed/Fixed sections |
| `resources/scoring-methodology.md` | Update scoring formulas, thresholds, component descriptions |
| `resources/hyperliquid-api.md` | Update endpoint list, response formats, new API types |
| `README.md` (English) | Update features, scoring table, flags, config vars, API response, architecture |
| `README.vi.md` (Vietnamese) | Same updates in Vietnamese |
| `SKILL.md` | Update version header, core capabilities, scoring, constraints |
| `CLAUDE.md` | Update architecture notes, env vars, API reference if affected |
| Memory file (`MEMORY.md`) | Update project structure, key patterns if changed |

**Minimum required per change type:**

- **New feature**: CHANGELOG + README (both) + SKILL.md + relevant resource .md
- **Bug fix**: CHANGELOG + any affected resource .md
- **New env var**: CHANGELOG + README (both, Configuration section) + CLAUDE.md
- **New API endpoint used**: CHANGELOG + `resources/hyperliquid-api.md` or `info-endpoint.md`
- **New WebSocket subscription**: CHANGELOG + `resources/websocket.md`
- **New flag or scoring change**: CHANGELOG + README (both) + SKILL.md + `resources/scoring-methodology.md`
- **New Lark alert type**: CHANGELOG + README (both, Web Dashboard section)
