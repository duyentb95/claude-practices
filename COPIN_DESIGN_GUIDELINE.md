# COPIN DESIGN SYSTEM — SKILL.md
> **Version:** 2.0.0 — March 2026  
> **Source:** app.copin.io · Figma Design System  
> **Product:** Copin Analyzer — On-chain Copy Trading Platform  
> **Theme:** Dark mode only · No light mode

---

## ⚡ HOW TO USE THIS FILE

This file is the **single source of truth** for all Copin UI work.

| Agent / Role | What to read |
|---|---|
| **AI Code Generator** | Sections 0 → 6 → 11 (Quick Ref) |
| **AI Design Reviewer** | Section 11 checklist |
| **Frontend Dev** | Sections 1–6 (tokens + components) |
| **AI Image Prompt** | Section 10.2 |
| **New team member** | Read all in order |

**Before generating ANY Copin UI:**
1. Check font availability (Section 3 — ABC Social Mono)
2. Use Quick Reference (Section 11) for token lookup
3. Follow component specs exactly — no improvisation

---

## 0. PRODUCT CONTEXT

```
Product      : Copin Analyzer
Type         : Web App — Crypto / DeFi Analytics Dashboard
Core feature : On-chain trader analysis + Copy trading (Perp DEX)
Users        : Crypto traders, DeFi users, copy traders
URL          : https://app.copin.io
Tech stack   : React + TypeScript
```

**Brand values:**
- Professional & Trustworthy (finance/data tool)
- Data-dense (tables, charts, numbers everywhere)
- Dark & Technical (crypto-native terminal aesthetic)
- Clean & Minimal (function first, no decoration)

---

## 1. COLOR SYSTEM

> All colors exact from Figma. Dark theme only — never use light backgrounds.

### 1.1 Primary

```
primary-1   : #4EAEFD   ← Electric blue — CTA, active state, link, focus
primary-2   : #97CFFD   ← Light blue tint — hover state, secondary CTA
```

### 1.2 Gradients

```
gradient-1  : #4EAEFD → #008CFF        ← Primary CTA button fill
gradient-2  : #FCFCFD → rgba(#FCFCFD, 0.18) ← Text fade, ghost overlay
gradient-3  : #272C43 → #0B0D17        ← Dark surface, card bg
gradient-4  : #ABECA2 → #2FB3FE → #6A8EEA → #A185F4  ← PREMIUM only
gradient-5  : #ABECA2 → #2FB3FE → #6A8EEA → #A185F4 (softer) ← Premium tint
gradient-6  : #A9AFFF → #FFAEFF        ← Special accent
gradient-7  : #FFC24B → #02FFE8        ← Leaderboard rank, gold tier
```

### 1.3 Semantic Colors

```
── PROFIT / LONG / SUCCESS ───────────────────────────────────
green-1   : #38D060   ← Main: profit text, Long badge, success (USE THIS)
green-2   : #6DD488   ← Muted profit, secondary indicator
green-3   : #2B9948   ← Deep: border, background tint for profit zones

── LOSS / SHORT / ERROR ──────────────────────────────────────
red-1     : #FA5547   ← Main: loss text, Short badge, error state (USE THIS)
red-2     : #FA7B70   ← Muted loss, secondary error
red-3     : #BC2B1F   ← Deep: border, background tint for loss zones

── WARNING / LEVERAGE / PENDING ──────────────────────────────
orange-1  : #FFC24B   ← Main: warning text, leverage badge (USE THIS)
orange-2  : #FCEFD1   ← Light tint
orange-3  : #CB8D14   ← Deep: dark warning zone
```

### 1.4 Neutral Scale

> Surface layers from darkest (page) to lightest (text).

```
neutral-7  : #0B0E18   ← Page background (darkest)
neutral-6  : #101423   ← Card / sidebar / panel (surface-1)
neutral-5  : #1F2232   ← Hover state / active row (surface-2)
neutral-4  : #313856   ← Borders / dividers / input border
neutral-3  : #777E90   ← Muted text / placeholder / disabled
neutral-2  : #C0C0C9   ← Secondary text / labels
neutral-1  : #FCFCFD   ← Primary text / headings (near white)
```

### 1.5 Semantic Token Map

```
── TEXT ──────────────────────────────────────────────────────
text-primary    : neutral-1  (#FCFCFD)
text-secondary  : neutral-2  (#C0C0C9)
text-muted      : neutral-3  (#777E90)
text-link       : primary-1  (#4EAEFD)
text-profit     : green-1    (#38D060)
text-loss       : red-1      (#FA5547)
text-warning    : orange-1   (#FFC24B)

── BACKGROUND ────────────────────────────────────────────────
bg-page         : neutral-7  (#0B0E18)
bg-card         : neutral-6  (#101423)
bg-hover        : neutral-5  (#1F2232)
bg-overlay      : rgba(0, 0, 0, 0.75) + blur(4px)

── STATUS TINTS (background zones) ──────────────────────────
bg-profit-tint  : rgba(56, 208, 96, 0.10)
bg-loss-tint    : rgba(250, 85, 71, 0.10)
bg-warning-tint : rgba(255, 194, 75, 0.10)
bg-primary-tint : rgba(78, 174, 253, 0.10)

── BORDER ────────────────────────────────────────────────────
border-default  : neutral-4  (#313856)
border-subtle   : rgba(49, 56, 86, 0.5)
border-focus    : primary-1  (#4EAEFD)
border-profit   : green-3    (#2B9948)
border-loss     : red-3      (#BC2B1F)
```

### 1.6 Color Rules

```
✅ MUST:
- Page background   → neutral-7 (#0B0E18) always
- Positive numbers  → green-1 (#38D060) always
- Negative numbers  → red-1 (#FA5547) always
- Primary CTA       → gradient-1 (#4EAEFD → #008CFF), text neutral-7
- Links / addresses → primary-1 (#4EAEFD)
- Borders           → neutral-4 (#313856)

❌ NEVER:
- Light / white backgrounds
- Pure black #000000
- gradient-4/5 for regular UI (premium only)
- Any green/red outside defined palette for profit/loss
- Mix colors outside this system
```

---

## 2. SPACING

```
Base unit: 4px (all values are multiples of 4)

space-1   :  4px   ← Icon gaps, badge padding
space-2   :  8px   ← Component internal gap
space-3   : 12px   ← Button padding-x (SM), list item gap
space-4   : 16px   ← Card padding, table cell horizontal
space-5   : 20px   ← Card padding (large)
space-6   : 24px   ← Section gap, modal padding
space-8   : 32px   ← Major section spacing
space-10  : 40px   ← Page section gap
space-12  : 48px   ← Page header padding
space-16  : 64px   ← Max layout gap

── TABLE SPECIFIC ────────────────────────────────────────────
cell-padding-x : 16px
cell-padding-y : 10px
row-height-min : 48px
```

---

## 3. BORDER RADIUS

> ⚠️ These values are from Figma — different from older docs.

```
radius-none : 0px      ← Table rows, data grid
radius-xs   : 2px      ← InputField, EditInput (very square)
radius-sm   : 4px      ← Button, Badge, Dropdown, Tooltip, Alert, Tag
radius-md   : 8px      ← Card, Stats widget
radius-lg   : 12px     ← Modal, drawer, large panel
radius-full : 9999px   ← Avatar, pill badge, Switch track
```

---

## 4. TYPOGRAPHY

### 4.1 Font Decision (ASK USER FIRST)

> ⚠️ **AI must ask before generating any UI:**
> *"Bạn đã cài font ABC Social Mono chưa?"*
> - **YES** → use Section 4.1A
> - **NO** → use Section 4.1B

#### 4.1A — Official Font (ABC Social Mono installed)

```
font-family : 'ABC Social Mono', monospace
→ Used for ALL text in the UI (heading, body, label, data)
→ Single font only — no secondary font
→ Monospace = fixed character width → terminal aesthetic
→ No need for separate mono font for wallet/hash (whole app is mono)
```

#### 4.1B — Fallback (ABC Social Mono NOT installed)

```
font-family : 'JetBrains Mono', 'Fira Code', 'Courier New', monospace
→ Closest monospace fallback — preserves terminal aesthetic
→ Last resort: 'Inter', -apple-system, sans-serif
```

### 4.2 Type Scale

```
── HEADINGS (always Bold 700) ───────────────────────────────
H1 : 48px Bold   ← Hero, large empty state
H2 : 40px Bold   ← Page title (rare in app)
H3 : 32px Bold   ← Section heading, dashboard title
H4 : 28px Bold   ← Modal title, panel heading
H5 : 24px Bold   ← Card title, widget heading

── BODY & UI ─────────────────────────────────────────────────
Large Regular : 16px / 400   ← Intro, description
Large Bold    : 16px / 700   ← KPI metric, emphasis
Body Regular  : 14px / 400   ← DEFAULT — table cell, form, body text
Body Bold     : 14px / 700   ← Table header, active nav, emphasis
Caption Regular: 12px / 400  ← Timestamp, hint text, secondary info
Caption Bold  : 12px / 700   ← Badge, tag, status, tab label
Small Regular : 10px / 400   ← Footnote, micro label (use sparingly)
Small Bold    : 10px / 700   ← Micro emphasis (use rarely)

── WEIGHT RULE ───────────────────────────────────────────────
Only 2 weights used: Regular (400) and Bold (700)
NEVER use 500 Medium or 600 Semi-bold
```

### 4.3 Usage Map

```
H4 (28 Bold)     → Modal title, drawer heading
H5 (24 Bold)     → Card heading, stats group label
Large Bold       → Big KPI numbers (Total PnL, Balance)
Body Regular     → Table cells, form labels (MOST USED)
Body Bold        → Table headers, selected nav item
Caption Regular  → Timestamps, helper text
Caption Bold     → Badges, tabs, status chips
```

### 4.4 Typography Rules

```
✅ MUST:
- Ask about ABC Social Mono BEFORE generating UI
- Headings always Bold — never Regular for H1–H5
- Font sizes only from scale (no 11px, 13px, 15px, 18px, 20px)
- Right-align all numbers in tables
- Positive numbers → text-profit color
- Negative numbers → text-loss color

❌ NEVER:
- Font-weight 500 or 600
- Font sizes outside the scale
- Left-align numbers in tables
- Font size < 10px
```

---

## 5. LAYOUT & GRID

```
── SIDEBAR ───────────────────────────────────────────────────
Width expanded  : 240px
Width collapsed : 60px (icon only)
Background      : neutral-6 (#101423)
Border-right    : 1px solid neutral-4 (#313856)

Nav item default:
  padding       : 10px 16px
  gap           : 12px (icon + label)
  color         : neutral-2 (#C0C0C9)
  hover bg      : neutral-5 (#1F2232)
  hover color   : neutral-1

Active nav item:
  background    : rgba(78, 174, 253, 0.10)
  color         : neutral-1 (#FCFCFD)
  border-left   : 2px solid primary-1 (#4EAEFD)
  icon color    : primary-1

── GRID ──────────────────────────────────────────────────────
Columns         : 12 (desktop), 4 (mobile)
Gutter          : 16px (desktop), 12px (mobile)
Max content width: ~1200px

── COMMON LAYOUTS ────────────────────────────────────────────
Stats row       : 4 cards (desktop), 2 (tablet), 1 (mobile)
Explorer        : Full-width table, sticky header
Profile page    : 2-column (chart left, stats right)
```

---

## 6. COMPONENTS

### 6.1 Data Table ⭐ CORE COMPONENT

> Most important component in Copin. Must implement precisely.

```
── STRUCTURE ─────────────────────────────────────────────────
Header row   : bg neutral-5 (#1F2232), text neutral-2 (uppercase, Caption Bold)
Data rows    : bg transparent
Hover row    : bg rgba(78, 174, 253, 0.08)
Active row   : bg rgba(78, 174, 253, 0.12), border-left 2px solid primary-1
Striped      : NOT USED — use hover state only

── COLUMN ALIGNMENT ──────────────────────────────────────────
Text / Name columns  → left-align
Number columns       → right-align ← CRITICAL
Status / Badge cols  → center-align
Action buttons       → right-align

── TYPICAL COLUMNS (Trader Explorer) ─────────────────────────
Rank | Trader (avatar + address) | PnL | Win Rate | Trades |
Avg ROI | Max Drawdown | Last Trade | Copy button

── CELL SPECS ────────────────────────────────────────────────
padding-x    : 16px
padding-y    : 10px
row-height   : 48px minimum
border-bottom: 1px solid rgba(49, 56, 86, 0.5)
```

---

### 6.2 Stats Card

```
── ANATOMY ───────────────────────────────────────────────────
┌──────────────────────────────────┐
│  [Icon 16px]  Label              │  ← neutral-2, Caption Bold
│                                  │
│  $1,234,567.89                   │  ← neutral-1, Large Bold, mono font
│  ↑ +12.34% (30D)                 │  ← green-1 / red-1, Caption Regular
└──────────────────────────────────┘

── STYLE ─────────────────────────────────────────────────────
background    : neutral-6 (#101423)
border        : 1px solid neutral-4 (#313856)
border-radius : 8px (radius-md)
padding       : 16px 20px
hover border  : primary-1 (#4EAEFD)
```

---

### 6.3 Button (`System/Button`)

> 5 types × 4 sizes × 5 icon configs. All from Figma.

#### Types

```
1. Normal            ← Filled solid — primary CTA
2. Out Line Primary  ← Outlined, primary color
3. Out Line White    ← Outlined, neutral color
4. Ghost Primary     ← No border, primary text
5. Ghost Primary White ← No border, white text
```

#### Visual Specs

```
── 1. NORMAL (Filled) ────────────────────────────────────────
Default : bg primary-1 (#4EAEFD) | color neutral-7 (#0B0E18) | border none
Hover   : bg primary-2 (#97CFFD) | color neutral-7
Disabled: opacity 0.4

── 2. OUT LINE PRIMARY ───────────────────────────────────────
Default : bg transparent | color primary-1 | border 1px solid primary-1
Hover   : bg rgba(78,174,253,0.10) | color primary-1 | border unchanged

── 3. OUT LINE WHITE ─────────────────────────────────────────
Default : bg transparent | color neutral-1 | border 1px solid neutral-4
Hover   : bg rgba(252,252,253,0.08) | color neutral-1 | border neutral-2

── 4. GHOST PRIMARY ──────────────────────────────────────────
Default : bg transparent | color primary-1 | border none
Hover   : bg rgba(78,174,253,0.10) | color primary-1

── 5. GHOST PRIMARY WHITE ────────────────────────────────────
Default : bg transparent | color neutral-1 | border none
Hover   : bg rgba(252,252,253,0.08) | color neutral-1

── SHARED: Disabled ──────────────────────────────────────────
opacity: 0.4 | cursor: not-allowed | pointer-events: none
```

#### Sizes

```
         Height  Pad-X  Gap  Font  Icon   Border-radius
LG 52  :  52px   16px   8px  16px  20px   4px
MD 40  :  40px   14px   8px  14px  16px   4px  ← DEFAULT
SM 32  :  32px   12px   6px  13px  14px   4px
XSM 24 :  24px   10px   4px  12px  12px   4px

Font weight: 500 (medium) for all sizes
Icon-only (circle): width = height, border-radius: 50%
Always add aria-label for icon-only buttons
```

#### Danger Variants

```
3 Danger types × same 4 sizes × same icon configs

── DANGER FILL ───────────────────────────────────────────────
Default : bg red-1 (#FA5547) | color neutral-7 (#0B0E18)
Hover   : bg red-2 (#FA7B70) | color neutral-7

── DANGER OUT LINE ───────────────────────────────────────────
Default : bg transparent | color red-1 | border 1px solid red-1
Hover   : bg rgba(250,85,71,0.10) | color red-1

── DANGER GHOST ──────────────────────────────────────────────
Default : bg transparent | color red-1 | border none
Hover   : bg rgba(250,85,71,0.10) | color red-1

Disabled: opacity 0.4 (all Danger types)
```

#### Usage Guide

```
Normal          → PRIMARY action, max 1 per section
                  "Copy Trade", "Confirm", "Save"
Out Line Primary → SECONDARY alongside Normal
                  "Add to Favorites", "Compare"
Out Line White   → NEUTRAL action, no brand emphasis
                  "Cancel", "Close", filter buttons
Ghost Primary   → TERTIARY inline / table row
                  "View Profile", "Edit", "Details"
Ghost White     → SUBTLE nav, breadcrumb, dismiss

Danger Fill     → Destructive primary (irreversible) — always needs confirm
Danger Outline  → Destructive secondary (alongside Cancel)
Danger Ghost    → Destructive inline (table row "Remove")

SIZE:
LG → Hero CTA, standalone
MD → Default page body  ← MOST USED
SM → Toolbar, table actions, side-by-side
XSM → Badge action, inline, dense table
```

---

### 6.4 Badge / Tag

```
── STATUS BADGES (rounded-full) ──────────────────────────────
Active   : bg rgba(56,208,96,0.12)  | text green-1  | border green-3
Paused   : bg rgba(255,194,75,0.12) | text orange-1 | border orange-3
Stopped  : bg rgba(250,85,71,0.12)  | text red-1    | border red-3
Premium  : gradient-4 background    | text neutral-7

── CHAIN / PROTOCOL BADGES (pill) ────────────────────────────
bg       : neutral-5 (#1F2232)
border   : 1px solid neutral-4 (#313856)
text     : neutral-2 (#C0C0C9)
icon     : protocol logo 16px + label Caption Bold

── LEVERAGE BADGE ────────────────────────────────────────────
bg       : rgba(255,194,75,0.12)
text     : orange-1 (#FFC24B)
border   : 1px solid orange-3 (#CB8D14)
format   : "10x", "25x"

── POSITION DIRECTION ────────────────────────────────────────
LONG  : bg rgba(56,208,96,0.12)  | text green-1 | icon arrow-up-right
SHORT : bg rgba(250,85,71,0.12)  | text red-1   | icon arrow-down-right

border-radius: 4px (all badges)
font: Caption Bold 12px
```

---

### 6.5 Checkbox (`System/Checkbox`)

```
Size        : 16×16px (fixed)
Border      : 1px (all states)
Border-radius: 4px
Disabled opacity: 0.5

── 7 STATES ──────────────────────────────────────────────────
Default     : bg transparent | border neutral-3 (#777E90)
Hovered     : bg transparent | border primary-1 (#4EAEFD)
Disabled    : bg transparent | border neutral-4 | opacity 0.5
Selected    : bg primary-1   | border none | icon checkmark, color neutral-7
Undetermined: bg primary-1   | border none | icon minus,     color neutral-7
Dis.Selected: bg primary-1   | border none | icon checkmark  | opacity 0.5
Dis.Undeter.: bg primary-1   | border none | icon minus      | opacity 0.5

Icon stroke: 1.5px | Icon color: neutral-7 (#0B0E18)

── WITH LABEL ────────────────────────────────────────────────
gap         : 8px
label font  : Caption Regular 12px (ABC Mono) / Body Regular 14px (fallback)
label color : neutral-1 (default) / neutral-3 (disabled)
alignment   : vertical center
```

---

### 6.6 Radio (`System/Radio`)

```
Size        : 16×16px (fixed), always circle
Border      : 1px (all states)
Border-radius: 50% (always)
Disabled opacity: 0.5

── 6 STATES ──────────────────────────────────────────────────
Default     : bg transparent | border neutral-3
Hovered     : bg transparent | border primary-1
Disabled    : bg transparent | border neutral-4  | opacity 0.5
Selected    : bg transparent | border primary-1  | inner dot 6×6px fill primary-1
Selected-bg : bg rgba(78,174,253,0.15) | border primary-1 | inner dot primary-1
              → Use when radio is inside highlighted row/card
Dis.Selected: bg transparent | border primary-1 | inner dot primary-1 | opacity 0.5

── WITH LABEL ────────────────────────────────────────────────
gap         : 8px
label font  : Caption Regular 12px (ABC Mono) / Body Regular 14px (fallback)
label color : neutral-1 (default) / neutral-3 (disabled)
group gap   : 12px (vertical) / 16px (horizontal)
```

> **Checkbox vs Radio:**
> - Checkbox → multi-select, toggle, parent/child indeterminate
> - Radio → single-select, mutually exclusive options (max ~8 options visible)

---

### 6.7 Switch / Toggle (`System/switch`)

```
Track  : 28×16px | border-radius 8px (pill)
Thumb  : 12×12px | border-radius 50% (circle)
Padding: 2px (thumb to track edge)

Thumb OFF position: left 2px
Thumb ON  position: left calc(100% - 14px)

── 4 STATES ──────────────────────────────────────────────────
OFF          : track neutral-4 (#313856) | thumb neutral-1 (#FCFCFD)
Disabled OFF : track neutral-4           | thumb neutral-3  | opacity 0.5
ON           : track primary-1 (#4EAEFD) | thumb neutral-1
Disabled ON  : track primary-1           | thumb neutral-1  | opacity 0.5

Animation    : thumb left 200ms ease-in-out | track bg 200ms ease-in-out
Reduced motion: transition none

── WITH LABEL ────────────────────────────────────────────────
gap         : 8px
label font  : Caption Regular 12px (ABC Mono) / Body Regular 14px (fallback)
label color : neutral-1 (default) / neutral-3 (disabled)
```

> Switch → instant effect (no submit needed)
> Checkbox → form selection (needs submit)

---

### 6.8 Dropdown (`System/Dropdown`)

#### Trigger — 3 Types

```
── TYPE 1: TEXT TRIGGER (inline, no border) ──────────────────
Use for: quick filter, trading pair selector
Anatomy: [LABEL neutral-3] [VALUE primary-1] [chevron neutral-3]

Example: "SELECT  ALL PAIRS ∨"
  "SELECT" → neutral-3, Caption Bold, uppercase
  "ALL PAIRS" → primary-1 (#4EAEFD), Caption Bold

States:
  Default   : value = primary-1
  Hover     : value = primary-2, underline
  Open      : chevron rotate 180°
  Disabled  : opacity 0.5

── TYPE 2: ICON + TEXT TRIGGER (inline, no border) ───────────
Use for: exchange / chain / protocol selector
Anatomy: [icon 20px circular] [label neutral-1 Body Bold] [chevron neutral-3]

States: same as Type 1

── TYPE 3: SELECT BOX (full border, form use) ────────────────
Use for: form select, filter panel, settings
Anatomy: [label text] [chevron right-aligned]

  height        : 40px (MD) / 32px (SM)
  padding-x     : 12px
  background    : neutral-6 (#101423)
  border        : 1px solid neutral-4
  border-radius : 4px
  label         : neutral-1, Body Regular 14px
  chevron       : neutral-3, 16px

States:
  Default   : border neutral-4
  Hover     : border primary-1, bg neutral-5
  Open      : border primary-1, bg neutral-5, chevron 180°
  Disabled  : opacity 0.5, text neutral-3
```

#### Menu Panel

```
background    : neutral-6 (#101423)
border        : 1px solid neutral-4 (#313856)
border-radius : 4px
padding       : 4px 0
min-width     : trigger width (min 160px)
max-height    : 240px (scroll beyond)
shadow        : 0 8px 24px rgba(0,0,0,0.5)
position      : absolute, gap 4px from trigger
z-index       : above content, below modal
animation     : fade + translateY(-4px → 0), 150ms ease-out
```

#### Dropdown Items — 3 Variants

```
── VARIANT 1: TEXT ONLY ──────────────────────────────────────
height 36px | padding 0 12px | font Caption Regular 12px
  Default  : text neutral-1, bg transparent
  Hover    : text neutral-1, bg neutral-5
  Selected : text primary-1 (#4EAEFD), bg transparent

── VARIANT 2: ICON + TEXT ────────────────────────────────────
height 36px | gap 8px | icon 16×16px circular
  Default  : text neutral-1, bg transparent
  Hover    : text neutral-1, bg neutral-5
  Selected : text primary-1, bg transparent

── VARIANT 3: CHECKBOX + TEXT ────────────────────────────────
height 36px | gap 8px | checkbox 16×16px (System/Checkbox)
  Unchecked: text neutral-1, bg transparent
  Hover    : checkbox Hovered state, bg neutral-5
  Checked  : text neutral-1 (NO color change), checkbox Selected state
  → Menu stays OPEN when item checked (multi-select)
```

#### Dropdown Rules

```
✅ MUST:
- Variant 1&2: selected text = primary-1
- Variant 3: text stays neutral-1 when checked
- Close on: click outside, Escape, single-select item click
- Keep open on: checkbox item click (multi-select)
- Show item count in Type 3 trigger when multiple selected

❌ NEVER:
- border-radius > 4px on menu panel
- Mix item variants in same menu
- Type 1/2 trigger for form fields (use Type 3)
- Change text color in checkbox dropdown items
```

---

### 6.9 Input System

> 4 input types for different contexts. All use monospace font.

#### Choose the right input

```
┌──────────────────┬─────────────────────────────────────────────┐
│ InputField       │ Standard form input with label + hint + border │
│ Input (inline)   │ Trading UI — underline only, blends into UI    │
│ EditInput        │ Inline edit — looks like text, click to edit   │
│ GroupInput       │ Filter builder: [Field][Op][Value][Unit]        │
└──────────────────┴─────────────────────────────────────────────┘
```

#### A. InputLabel

```
Layout  : flex row, space-between, margin-bottom 4px

Left — Label:
  font  : Caption Regular 12px (ABC Mono) / Body Regular 14px
  color : neutral-2 (#C0C0C9)

Right — 2 variants:
  Value    : color by semantic (green-1/orange-1/red-1/neutral-2)
  Decoration: color neutral-3 (muted helper text)

Error state: BOTH left label AND right value → red-1 (#FA5547)
```

#### B. Input Inline (`System/Input`)

```
background    : transparent
border        : none
border-bottom : 1px solid neutral-4 (#313856) ← underline only
border-radius : 0
padding       : 4px 0
font          : Caption Regular 12px, text-align right, monospace

── SUFFIX ELEMENTS ───────────────────────────────────────────
Token selector : [icon 16px] [name Caption Bold neutral-2] [chevron neutral-3]
Sub-label      : Caption Regular 12px, neutral-3, margin-top 2px
MAX link       : Caption Bold 12px, orange-1 (#FFC24B), uppercase, clickable
Copy icon      : clipboard 14px neutral-3 → neutral-1 on hover

── STATES ────────────────────────────────────────────────────
Default  : border-bottom neutral-4
Focused  : border-bottom neutral-4 ← NO COLOR CHANGE when focused
Error    : border-bottom red-1 (#FA5547)

Use for: trading forms, token amount input, blend-into-UI context
```

#### C. InputField (`System/InputField`)

```
── SIZES ─────────────────────────────────────────────────────
MD : height 40px | padding 8px 12px | font Caption Regular 12px
SM : height 32px | padding 6px 10px | font Caption Regular 12px

── BASE ──────────────────────────────────────────────────────
background    : neutral-7 (#0B0E18) ← most states
border        : 1px solid [see states]
border-radius : 2px ← very square
font-family   : ABC Social Mono / monospace fallback
font-size     : 12px
color         : neutral-1 | placeholder: neutral-3
transition    : border-color 150ms ease
outline       : none (never browser default)

── 6 STATES ──────────────────────────────────────────────────
1. Default   : border neutral-4  | bg neutral-7
2. Filled    : border neutral-4  | bg neutral-7 | text neutral-1
3. Hovered   : border neutral-3  | bg neutral-7
4. Focused   : border primary-1  | bg neutral-5 ← ONLY state with neutral-5
               box-shadow NONE   | glow NONE
5. Disabled  : border neutral-4  | bg neutral-7 | text neutral-3 | opacity 0.5
6. Error     : border red-1      | bg neutral-7 ← bg does NOT change

── ANATOMY (top to bottom) ───────────────────────────────────
[InputLabel row]     margin-bottom 4px
[Input box]          height 40px / 32px
[Hint row]           margin-top 4px
  Normal: ⓘ 12px neutral-3  +  "hint text" Caption Regular neutral-3
  Error:  ⚠ 12px red-1      +  "error text" Caption Regular red-1

Use for: copy trade settings, filter forms, any labeled input
```

#### D. EditInput (`System/EditInput`)

```
── REST STATE (not editing) ──────────────────────────────────
Layout : [label neutral-2] [value primary-1] [✏ pencil neutral-3]
         flex row, align center, gap 8px

Default  : edit icon hidden (hover reveal)
Filled   : edit icon always visible
Hover    : edit icon → neutral-1, value → primary-2, underline on value
Disabled : label + value neutral-3 opacity 0.5, icon hidden

── EDITING STATE ─────────────────────────────────────────────
Layout : [label neutral-2] [input box] [unit suffix]

Input box:
  height        : 40px
  padding       : 8px 12px
  background    : neutral-5 (#1F2232)
  border        : 1px solid primary-1
  border-radius : 2px
  font          : Caption Regular 12px monospace
  text-align    : right (numeric)

Unit suffix: Caption Regular 12px neutral-3 ("USDC", "USD", "%")
Error state: border → red-1

Use for: inline settings ("Collateral Lower Than 523 USD ✏"), config rows
```

#### E. GroupInput (`System/GroupInput`)

```
Anatomy: [Field ∨] [Operator ∨] [Value] [Unit]
Example: "Trades ∨"  "Greater than ∨"  "5"  "$"

── STYLE (all segments) ──────────────────────────────────────
background    : transparent
border        : none
border-bottom : 1px solid neutral-4
border-radius : 0
padding       : 4px 8px
gap between   : 4px (no divider)

Dropdown segments : text neutral-1 14px | chevron neutral-3 10px
Value input       : text neutral-1 14px right-align | min-width 40px
Unit label        : text neutral-3 14px

── STATES (per segment) ──────────────────────────────────────
Default  : border-bottom neutral-4
Hover    : border-bottom neutral-3 (ONLY hovered segment)
Focused  : border-bottom primary-1 (ONLY focused segment, others stay neutral-4)
Disabled : all segments opacity 0.5
Error    : border-bottom red-1 (ONLY error segment)

Use for: filter builder ("Trades | Greater than | 5 | $")
         condition editor ("PnL | Less than | -100 | USD")
```

#### Input Rules

```
✅ MUST:
- InputField focused: border-color → primary-1 ONLY, NO glow, NO shadow
- Input Inline focused: border-bottom STAYS neutral-4 (NO color change)
- GroupInput focused: ONLY focused segment changes, others unchanged
- Error: border → red-1, bg unchanged, text unchanged
- Hint/Error row: always present (reserve space even when empty)
- Disabled: opacity 0.5 always
- Numeric input: text-align right

❌ NEVER:
- outline: auto (always outline: none)
- box-shadow or glow on any input
- Change bg on error state
- border-radius > 4px on any input
- Left-align numbers
- Use InputField for inline edit context (use EditInput)
- Use GroupInput for single value (use InputField)
```

---

### 6.10 Tabs (`System/Tabs`)

#### TabItem Sizes

```
PAGE TAB large : height 48px | padding 0 12px | font Body Bold 14px
PAGE TAB small : height 40px | padding 0 10px | font Caption Bold 12px
```

#### TabItem Anatomy & States

```
Anatomy: [icon 14px] [LABEL uppercase] [count]
gap: icon→label 6px, label→count 4px

Default state:
  color    : neutral-3 (#777E90) — icon + label + count all muted
  font     : Bold (to prevent layout shift)
  bg       : transparent
  cursor   : pointer
  hover    : color neutral-2

Active state:
  color    : neutral-1 (#FCFCFD)
  font     : Bold
  bg       : transparent
  border-bottom: 1px solid primary-1 (#4EAEFD) ← HAS LINE variant only

Count badge:
  font  : Caption Regular 12px (lighter than label Bold)
  color : neutral-3 (inactive) / neutral-1 (active)
  No background, no border — plain text only
```

#### 3 Tab Group Variants

```
HAS LINE:
  Active tab  : border-bottom 1px solid primary-1
  Group       : border-bottom 1px solid neutral-4 (full-width divider)
  Active line overlaps group divider
  → Use for: main page navigation

NO LINE:
  No borders at all
  Active tab stands out by color + weight only
  → Use for: section switchers, protocol selectors

NO ICON:
  Either HAS LINE or NO LINE but without icons
  → Use for: compact tabs where icons add no context
```

#### Tab Context

```
Large (48px) + HAS LINE → Main nav: "Explorer|Open Interest|Leaderboard|Live Trades"
Small (40px) + HAS LINE → Sub-nav: "CEX Management|DEX Management|History"
Any + NO LINE           → Protocol/timeframe switcher
Any + NO ICON           → Filter type: "Default|Percentile"
```

#### Tab Rules

```
✅ MUST:
- Active: neutral-1 + Bold. Inactive: neutral-3 + Bold (same weight → no shift)
- Count badge: Regular weight (lighter than Bold label)
- Label: uppercase + letter-spacing
- HAS LINE: group border-bottom neutral-4 spans full width

❌ NEVER:
- Background fill on active tab
- border-radius on tabs
- NO LINE for main navigation
- Different font-size between active/inactive
```

---

### 6.11 Tooltip (`System/Tooltip`)

```
── BASE STYLE ────────────────────────────────────────────────
background    : neutral-5 (#1F2232)
border        : 1px solid neutral-4 (#313856)
border-radius : 4px
shadow        : 0 4px 16px rgba(0,0,0,0.5)
z-index       : above content, below modal

Arrow: 6×6px triangle, same color as bg (neutral-5), border neutral-4

── TYPE 1: SIMPLE TEXT ───────────────────────────────────────
padding       : 8px 12px
max-width     : 160px
content       : Caption Regular 12px, neutral-1, center-aligned

── TYPE 2: RICH TOOLTIP ──────────────────────────────────────
padding       : 12px
max-width     : 240px

[ⓘ 14px] [Title Caption Bold neutral-1]    gap 6px
[Body Caption Regular neutral-2]            margin-top 4px
[BUTTON Caption Bold primary-1 uppercase]   margin-top 8px, right-align
                                            Ghost Primary style

── BEHAVIOR ──────────────────────────────────────────────────
Trigger       : hover (desktop), tap (mobile)
Show delay    : 300ms (prevents flicker on mouse-over)
Hide delay    : 100ms
Animation     : fade 150ms ease-out (in), 100ms ease-in (out)
Auto-flip     : yes, near viewport edges
Stay on hover : yes (for Rich type with interactive content)
Default pos   : top-center (arrow bottom-center)

Type 1 → Icon button tooltips, truncated text, metric explanations
Type 2 → Feature explanations with CTA, referral info, complex warnings
```

---

### 6.12 Alert

```
── ANATOMY ───────────────────────────────────────────────────
┌──────────────────────────────────────┐
│ [icon 16px]  [Title Caption Bold]    │
│                                      │
│ [Body Caption Regular]               │
│                                      │
│                           [BUTTON]   │
└──────────────────────────────────────┘

padding       : 12px 16px
border-radius : 4px
icon          : aligned top with title text

── 5 VARIANTS ────────────────────────────────────────────────
INFO:
  bg      : rgba(78,174,253,0.08)   | border: rgba(78,174,253,0.2)
  icon    : primary-1               | title: neutral-1
  body    : neutral-2               | button: primary-1

INFO BORDERED (highlighted):
  bg      : rgba(78,174,253,0.12)   | border: primary-1 (full opacity)
  icon    : primary-1               | title: primary-1
  body    : neutral-2               | button: primary-1

ERROR:
  bg      : rgba(250,85,71,0.08)    | border: rgba(250,85,71,0.2)
  icon    : red-1 (#FA5547)         | title: red-1
  body    : neutral-2               | button: red-1

WARNING:
  bg      : rgba(255,194,75,0.08)   | border: rgba(255,194,75,0.2)
  icon    : orange-1 (#FFC24B)      | title: orange-1
  body    : neutral-2               | button: orange-1

SUCCESS:
  bg      : rgba(56,208,96,0.08)    | border: rgba(56,208,96,0.2)
  icon    : green-1 (#38D060)       | title: green-1
  body    : neutral-2               | button: green-1

RULE: body text is ALWAYS neutral-2 regardless of variant
RULE: icon + title share semantic color (except INFO where title = neutral-1)
```

---

### 6.13 Modal / Dialog

```
backdrop      : rgba(0,0,0,0.75) + blur(4px)
background    : neutral-6 (#101423)
border        : 1px solid neutral-4 (#313856)
border-radius : 12px
padding       : 24px
max-width     : 480px (sm) | 640px (md) | 800px (lg)
animation     : fade + scale(0.95→1), 200ms ease-out

Header:
  title : H4 28px Bold neutral-1
  divider: 1px solid neutral-4
  close : Ghost icon button, neutral-3 → neutral-1 hover
```

---

### 6.14 Icon Size System

```
── UI ICONS (line / outline style) ───────────────────────────
12px → Hint icon, badge icon (micro)
16px → Inline with Caption, table action  ← MOST USED
18px → Inline with Body text, button icon
20px → Standalone action, nav icon
24px → Section icon, empty state

── BRAND / TOKEN ICONS (filled, colorful) ────────────────────
16px → Inline badge, tab icon
18px → Dropdown item, tag
24px → Standard token/protocol  ← MOST USED
32px → Card header, featured protocol
40px → Profile/avatar

── PAIRING RULE ──────────────────────────────────────────────
Caption (12px) text → UI icon 12–14px
Body (14px) text    → UI icon 16–18px
Button MD 40        → UI icon 16px
Button LG 52        → UI icon 20px
Token in list       → Brand icon 24px
Token in badge      → Brand icon 16–18px
```

---

## 7. CHART COMPONENTS

```
── PNL LINE CHART ────────────────────────────────────────────
Background    : transparent / neutral-6
Grid lines    : rgba(49,56,86,0.5)
Axis text     : neutral-3 (#777E90)
Positive line : green-1 (#38D060)
Negative line : red-1 (#FA5547)
Area fill     : gradient from line color → transparent 15%
Tooltip bg    : neutral-5, border neutral-4

── RADAR CHART (Percentile) ──────────────────────────────────
Background    : neutral-6
Grid stroke   : rgba(49,56,86,0.6)
Fill area     : rgba(78,174,253,0.15)
Stroke        : primary-1 (#4EAEFD)
Axis labels   : neutral-2, Caption Regular

── BAR CHART ─────────────────────────────────────────────────
Positive bars : green-1 (#38D060)
Negative bars : red-1 (#FA5547)
Zero line     : neutral-4

── CHART ANIMATION ───────────────────────────────────────────
Line draw     : 800ms ease-out (left → right)
Bar appear    : 400ms ease-out (bottom → up)
Count-up KPI  : 600ms on first load
```

---

## 8. DATA DISPLAY PATTERNS

### 8.1 PnL / Financial Numbers ⭐ CRITICAL

```
Positive (+):
  color  : green-1 (#38D060)
  prefix : "+" always (e.g. +$1,234.56 / +12.34%)
  icon   : ▲ arrow-up

Negative (-):
  color  : red-1 (#FA5547)
  prefix : "-" always (e.g. -$567.89 / -5.67%)
  icon   : ▼ arrow-down

Zero:
  color  : neutral-2 (#C0C0C9)
  display: $0.00

── FORMAT RULES ──────────────────────────────────────────────
USD amount    : $1,234,567.89      (2 decimal, comma separator)
Percentage    : +12.34%            (always show +/- sign)
Crypto        : 0.00123456 BTC     (6 decimal, mono font)
Large (>1M)   : $1.23M / $4.56B   (abbreviate)
```

### 8.2 Wallet Address

```
Display       : 0x1234...5678 (truncated, first 6 + last 4)
Full on hover : show full in tooltip
Font          : monospace
Color         : primary-1 (#4EAEFD)
Hover         : underline, cursor pointer
Click         : copy to clipboard → toast "Copied!"
External link : 12px icon after address
```

### 8.3 Percentile Rank

```
Top 10%  → gradient-7 text (#FFC24B → #02FFE8) — gold tier
Top 25%  → green-1 (#38D060)
Top 50%  → neutral-2 (#C0C0C9)
Bottom   → red-1 (#FA5547)
```

### 8.4 Time Display

```
Recent  : "2 hours ago", "just now" ← neutral-2
Date    : "Feb 28, 2026"
DateTime: "Feb 28, 2026 14:30"
```

---

## 9. MOTION & ANIMATION

```
── DURATIONS ─────────────────────────────────────────────────
instant  :   0ms
fast     : 100ms   ← badge, tooltip fade
normal   : 200ms   ← hover states, dropdown  ← DEFAULT
slow     : 300ms   ← modal open, panel slide
slower   : 500ms   ← page transition, chart

── EASING ────────────────────────────────────────────────────
ease-out     : cubic-bezier(0, 0, 0.2, 1)       ← elements appear
ease-in-out  : cubic-bezier(0.4, 0, 0.2, 1)     ← elements move

prefers-reduced-motion: disable all except fade
```

---

## 10. AI GENERATION RULES

### 10.1 Code Generation

```
STEP 0 — BEFORE WRITING CODE:
Ask: "Bạn đã cài font ABC Social Mono chưa?"
  YES  → font-family: 'ABC Social Mono', monospace
  NO   → font-family: 'JetBrains Mono', 'Fira Code', monospace

── REQUIRED TOKENS ───────────────────────────────────────────
Page bg       : neutral-7   #0B0E18
Card bg       : neutral-6   #101423  + border neutral-4 #313856
Hover surface : neutral-5   #1F2232
Primary text  : neutral-1   #FCFCFD
Secondary text: neutral-2   #C0C0C9
Positive data : green-1     #38D060
Negative data : red-1       #FA5547
Warning       : orange-1    #FFC24B
Primary CTA   : gradient-1  #4EAEFD → #008CFF  (text: neutral-7)
Links/Address : primary-1   #4EAEFD
Focus border  : primary-1   #4EAEFD

── REQUIRED BEHAVIORS ────────────────────────────────────────
- Always show +/- sign on PnL, ROI, percent change
- Wallet addresses: truncated 0x1234...5678, mono font, primary-1
- Numbers in tables: right-aligned
- Inputs: no outline, no glow on focus — border-color change only
- Disabled states: opacity 0.5

❌ BANNED:
- Light/white backgrounds
- Green/red outside palette for profit/loss
- gradient-4 for regular UI (premium only)
- center-align numbers in tables
- box-shadow or glow on inputs
- font-weight 500 or 600
```

### 10.2 Image Prompt (Midjourney / DALL-E)

```
Base string:
"dark crypto trading dashboard, deep navy #0B0E18 background,
electric blue #4EAEFD accents, data-dense terminal interface,
professional fintech UI, green #38D060 profit indicators,
red #FA5547 loss indicators, monospace font, ABC Social Mono"

Never use: "colorful", "bright", "light theme", "minimalist white"
```

### 10.3 Design Review Checklist

```
□ Page bg = neutral-7 (#0B0E18)?
□ Cards = neutral-6 (#101423) + border neutral-4?
□ Text primary = neutral-1 | secondary = neutral-2?
□ Positive numbers = green-1 (#38D060)?
□ Negative numbers = red-1 (#FA5547)?
□ Warning = orange-1 (#FFC24B)?
□ Primary CTA = gradient-1, text = neutral-7?
□ Links / wallet = primary-1 (#4EAEFD)?
□ Table numbers = right-aligned?
□ Font = ABC Social Mono (or monospace fallback)?
□ Only weights 400 and 700 used?
□ Input focus = border-color only, no glow?
□ Disabled = opacity 0.5 throughout?
□ gradient-4 = premium elements only?
□ border-radius: buttons 4px | inputs 2px | cards 8px | modals 12px?
□ Contrast ≥ 4.5:1 for all text?
```

---

## 11. QUICK REFERENCE

```
┌─────────────────────────────────────────────────────────────┐
│  BACKGROUNDS                                                 │
│  Page              → neutral-7  #0B0E18                     │
│  Card / Surface    → neutral-6  #101423  + border #313856   │
│  Hover / Active    → neutral-5  #1F2232                     │
│                                                              │
│  TEXT                                                        │
│  Primary           → neutral-1  #FCFCFD                     │
│  Secondary         → neutral-2  #C0C0C9                     │
│  Muted             → neutral-3  #777E90                     │
│  Link / Address    → primary-1  #4EAEFD                     │
│                                                              │
│  SEMANTIC                                                    │
│  Profit / Long     → green-1    #38D060                     │
│  Loss / Short      → red-1      #FA5547                     │
│  Warning / Lever.  → orange-1   #FFC24B                     │
│  Primary CTA       → gradient-1 #4EAEFD → #008CFF           │
│                                                              │
│  FONT                                                        │
│  Brand             → ABC Social Mono (ask user first)        │
│  Fallback          → JetBrains Mono, Fira Code               │
│  Weights           → 400 Regular / 700 Bold ONLY             │
│  Base size         → 12px (ABC Mono) / 14px (fallback)       │
│                                                              │
│  BORDER RADIUS                                               │
│  Button / Badge    → 4px                                     │
│  Input / EditInput → 2px                                     │
│  Card / Widget     → 8px                                     │
│  Modal / Drawer    → 12px                                    │
│  Avatar / Toggle   → 9999px (full)                           │
│                                                              │
│  SPACING BASE      → 4px unit                                │
│  SIDEBAR           → 240px (expanded) / 60px (collapsed)     │
└─────────────────────────────────────────────────────────────┘
```

---

*Extracted from app.copin.io + Figma Design System*  
*Update this file when UI changes. Last updated: March 2026*
