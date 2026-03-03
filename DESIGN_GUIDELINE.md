# Dashboard Design Guideline

Monorepo sử dụng hai phong cách design chính tùy theo loại UI:

- **Retro Terminal / Hacker UI** — dùng cho copy-trade terminal dashboard (CSS dark, monospace, ASCII art)
- **Trading Data Dashboard** — dùng cho data-heavy scanner/analytics UI (GitHub dark theme, table-centric)

---

## I. Trading Data Dashboard Style *(Insider Scanner, Analytics)*

Lấy cảm hứng từ GitHub dark theme và trading data terminals chuyên nghiệp. Tối giản, mật độ thông tin cao, không có yếu tố trang trí thừa. Toàn bộ layout xoay quanh table + badge.

---

### Color Palette

#### Background

| Variable | Hex | Usage |
|----------|-----|-------|
| `--bg` | `#0d1117` | Page background |
| `--bg-card` | `#161b22` | Card / panel background |
| `--bg-hover` | `#1c2128` | Row hover state |
| `--border` | `#21262d` | All borders, dividers |

#### Text

| Variable | Hex | Usage |
|----------|-----|-------|
| `--bright` | `#f0f6fc` | Primary values, coin names |
| `--text` | `#c9d1d9` | Body text |
| `--dim` | `#8b949e` | Labels, table headers, secondary info |

#### Accent — Semantic Colors

| Variable | Hex | Usage |
|----------|-----|-------|
| `--cyan` | `#39c5cf` | Coin symbols, links, active states |
| `--green` | `#3fb950` | BUY, LONG, connected, positive |
| `--red` | `#f85149` | SELL, SHORT, disconnected, MEGA flag |
| `--orange` | `#d18f52` | USD sizes (primary data emphasis) |
| `--yellow` | `#d29922` | Warnings, fill count, queue |
| `--magenta` | `#bc8cff` | FIRST_TIMER flag, special wallets |
| `--blue` | `#58a6ff` | Wallet addresses, external links |

---

### Typography

```css
font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
```

| Size | Usage |
|------|-------|
| `14px / bold` | Logo / title |
| `13px / bold` | Coin symbol (e.g., `BTC`, `ETH`) |
| `13px` | Stat values in header |
| `12px` | Body text (default) |
| `11px` | Addresses, log lines, badges |
| `10px` | Table headers (uppercase), labels, mini badges |

**Letter spacing:**
- Logo: `1.5px`
- Table headers: `0.8px`
- Card titles: `1.5px`
- Body: default

---

### Layout

```
┌──────────────────────────────────────── sticky header ──┐
│ ⚡ TITLE   ● CONNECTED   up 5m      Pairs  Trades  ...  │
├─────────────────────────────────────────────────────────┤
│ ┌─ Card: LARGE TRADES ──────────────────────────────┐   │
│ │ [table rows...]                                   │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌─ Card: SUSPICIOUS WALLETS ────────────────────────┐   │
│ │ [table rows...]                                   │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌─ Card: ACTIVITY LOG ──────────────────────────────┐   │
│ │ [log lines...]                                    │   │
│ └───────────────────────────────────────────────────┘   │
├─────────────────────────────────── fixed bottom bar ────┤
│ ● 14:35:22                               Reconnects: 0  │
└─────────────────────────────────────────────────────────┘
```

**Max width:** none (full width, data-dense)
**Padding:** `14px 20px`
**Card gap:** `12px`

---

### Components

#### Card

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.card-header {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--bright);
}
```

#### Table

```css
table { width: 100%; border-collapse: collapse; }

th {
  padding: 7px 12px;
  color: var(--dim);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

td {
  padding: 6px 12px;
  border-bottom: 1px solid rgba(33,38,45,.6);
  white-space: nowrap;
  vertical-align: middle;
}

tr:hover td { background: var(--bg-hover); }
tr:last-child td { border-bottom: none; }
```

#### Badges

```css
/* Base */
.badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }

/* Side */
.b-buy  { background: rgba(63,185,80,.12); color: var(--green); }
.b-sell { background: rgba(248,81,73,.12); color: var(--red); }

/* Flag badges */
.b-mega  { background: rgba(248,81,73,.12);  color: var(--red);     border: 1px solid rgba(248,81,73,.25); }
.b-first { background: rgba(188,140,255,.12); color: var(--magenta); border: 1px solid rgba(188,140,255,.25); }
.b-new   { background: rgba(210,153,34,.12);  color: var(--yellow);  border: 1px solid rgba(210,153,34,.25); }
.b-large { background: rgba(57,197,207,.08);  color: var(--cyan);    border: 1px solid rgba(57,197,207,.2); }
```

#### Header Stat

```
Pairs     Trades Recv    Large    Suspects    Queue
─────     ───────────    ─────    ────────    ─────
229          7,241         45         3          0
```

```css
.stat-label { color: var(--dim); font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
.stat-value { color: var(--bright); font-size: 13px; font-weight: 600; }
```

#### Connection Indicator

```css
.wsdot.on {
  background: var(--green);
  box-shadow: 0 0 6px var(--green);
  animation: glow 2s ease-in-out infinite;
}
@keyframes glow {
  0%,100% { box-shadow: 0 0 5px var(--green); }
  50%      { box-shadow: 0 0 10px var(--green); }
}
```

#### Row Flash (new data)

```css
@keyframes rowFlash {
  from { background-color: rgba(57,197,207,.1); }
  to   { background-color: transparent; }
}
.flash td { animation: rowFlash 1.5s ease-out forwards; }
```

Apply class `flash` on `<tr>` for rows that are NEW since last render.

#### Copin / External Link Button

```css
.copin {
  color: var(--dim);
  text-decoration: none;
  font-size: 10px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  transition: all .15s;
}
.copin:hover {
  color: var(--cyan);
  border-color: var(--cyan);
  background: rgba(57,197,207,.05);
}
```

---

### Data Formatting

| Type | Format | Example |
|------|--------|---------|
| USD < $1K | `$NNN` | `$850` |
| USD $1K–$1M | `$NNNK` | `$306K` |
| USD ≥ $1M | `$N.NNM` | `$1.49M` |
| Price ≥ $1K | `$N,NNN.NN` | `$88,099.00` |
| Price ≥ $1 | `$N.NNN` | `$28.923` |
| Price < $1 | `$0.NNNNNN` | `$0.108240` |
| Price tiny | exponential | `$1.23e-7` |
| Time | `HH:MM:SS` | `14:35:22` |
| Uptime | `Xh Ym` / `Xm Ys` / `Xs` | `5m 30s` |

### Color Rules for Values

| Value type | Color |
|------------|-------|
| USD Size (prominent) | `--orange` |
| USD Size (MEGA) | `--red` + bold |
| BUY side | `--green` badge |
| SELL side | `--red` badge |
| Coin symbol | `--cyan` bold 13px |
| Wallet address | `--blue` (regular), `--magenta` (FIRST), `--red` (MEGA) |
| 90d fills = 0 | `--magenta` bold |
| 90d fills < threshold | `--yellow` |
| 90d fills normal | `--dim` |
| Fill count > 1 | `--yellow` `Nf` |
| Fill count = 1 | `--dim` `1f` |
| Time / price | `--dim` |

---

### Scrollbar

```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--dim); }
```

---

## II. Retro Terminal / Hacker UI Style *(Copy-Trade Terminal)*

Phong cách **Retro Terminal / Hacker UI** với giao diện tối, font monospace, và các màu accent nổi bật. Thiết kế lấy cảm hứng từ terminal macOS và các trading interface chuyên nghiệp.

---

### Color Palette

#### Background Colors

| Variable | Hex | Usage |
|----------|-----|-------|
| `--bg-primary` | `#0a0e14` | Body background |
| `--bg-secondary` | `#0d1117` | Footer background |
| `--bg-panel` | `#0f1419` | Panel background |
| `--bg-tertiary` | `#151b23` | Card/row background |
| `--border-color` | `#1e2733` | Borders, dividers |

#### Text Colors

| Variable | Hex | Usage |
|----------|-----|-------|
| `--text-primary` | `#b3b9c5` | Main text |
| `--text-secondary` | `#565d68` | Secondary text, labels |
| `--text-muted` | `#3d4450` | Disabled, hint text |

#### Accent Colors

| Variable | Hex | Usage |
|----------|-----|-------|
| `--accent-cyan` | `#39c5cf` | Primary accent, links, highlights |
| `--accent-green` | `#50c878` | Success, positive values, BID |
| `--accent-red` | `#e55561` | Error, negative values, ASK |
| `--accent-yellow` | `#e6b450` | Warning, medium priority |
| `--accent-magenta` | `#c792ea` | Special states (hedging mode) |

---

### Typography

```css
font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

### Font Sizes

| Size | Usage |
|------|-------|
| `14px` | Header title |
| `13px` | Status bar values, totals |
| `12px` | Body text |
| `11px` | Table content, terminal output |
| `10px` | Labels, tags, captions |

### Font Weights

| Weight | Usage |
|--------|-------|
| `400` | Regular text |
| `500` | Table headers |
| `600` | Panel titles, values, tags |
| `700` | Logo |

### Letter Spacing

- Headers/Titles: `letter-spacing: 2px`
- Labels: `letter-spacing: 1px`
- Body text: default

---

### Components

#### Panel

```
┌─────────────────────────────────────────┐
│ ● ● ●  PANEL TITLE                    - │  ← Header
├─────────────────────────────────────────┤
│                                         │
│           Panel Content                 │  ← Content
│                                         │
└─────────────────────────────────────────┘
```

**Structure:**
- Header với 3 dots màu (red, yellow, green) giống terminal macOS
- Title uppercase với letter-spacing
- Action button (+/-) ở góc phải
- Content padding: `14px`

**CSS:**
```css
.panel {
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 4px;
}

.panel-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color);
}

.panel-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--text-secondary);
}
```

#### Panel Dots

```css
.panel-dot { width: 10px; height: 10px; border-radius: 50%; }
.panel-dot.red    { background: var(--accent-red); }
.panel-dot.yellow { background: var(--accent-yellow); }
.panel-dot.green  { background: var(--accent-green); }
```

---

#### Status Indicator

```css
.status-dot.connected {
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--accent-green);
}
```

---

#### Tags / Badges

```css
.bucket-tag {
    padding: 4px 10px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
}
```

---

#### Terminal Output

```css
.terminal-prompt { color: var(--accent-green); }
.terminal-text.info  { color: var(--accent-cyan); }
.terminal-text.warn  { color: var(--accent-yellow); }
.terminal-text.error { color: var(--accent-red); }
.terminal-cursor {
    width: 8px; height: 14px;
    background: var(--accent-green);
    animation: blink 1s infinite;
}
@keyframes blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
```

---

### Table

```css
.position-table th {
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 10px;
}
.position-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-color);
}
.positive { color: var(--accent-green); }
.negative { color: var(--accent-red); }
```

---

### Layout

```
┌─────────────────────────────────────────────┐
│                   HEADER                    │
├─────────────────────────────────────────────┤
│                 STATUS BAR                  │
├──────────────────────┬──────────────────────┤
│   Position Tracker   │      Orderbook       │
├──────────────────────┼──────────────────────┤
│   Terminal Output    │   Pending Orders     │
├──────────────────────┴──────────────────────┤
│               PnL History                   │
├─────────────────────────────────────────────┤
│                   FOOTER                    │
└─────────────────────────────────────────────┘
```

---

### Scrollbar

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-tertiary); }
::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
```

---

## Shared Best Practices

1. **CSS variables** thay vì hardcode colors
2. **Uppercase + letter-spacing** cho headers và labels
3. **Monospace font** cho tất cả text
4. **Color coding** nhất quán: green=positive/buy, red=negative/sell, yellow=warning, cyan=labels/links
5. **No border-radius** lớn hơn 6px
6. **Minimal animation** — chỉ dùng cho data updates (flash) và connection state (glow/pulse)
7. **Data density first** — padding nhỏ, font nhỏ, information tối đa per pixel