# Chiến Lược Phát Hiện Insider Trader trên Hyperliquid

## Mục Lục

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Nguồn Dữ Liệu từ Hyperliquid API](#2-nguồn-dữ-liệu-từ-hyperliquid-api)
3. [Strategy 1: Pre-Event Timing Analysis](#3-strategy-1-pre-event-timing-analysis)
4. [Strategy 2: Abnormal Win Rate Detection](#4-strategy-2-abnormal-win-rate-detection)
5. [Strategy 3: New Token / Low-Cap Sniping](#5-strategy-3-new-token--low-cap-sniping)
6. [Strategy 4: Position Size Anomaly](#6-strategy-4-position-size-anomaly)
7. [Strategy 5: PnL Consistency & Equity Curve](#7-strategy-5-pnl-consistency--equity-curve)
8. [Strategy 6: Wallet Cluster & Fund Flow](#8-strategy-6-wallet-cluster--fund-flow)
9. [Strategy 7: Leverage Conviction Pattern](#9-strategy-7-leverage-conviction-pattern)
10. [Strategy 8: Liquidation Front-Running](#10-strategy-8-liquidation-front-running)
11. [Strategy 9: Wash Trading / Self-Trading](#11-strategy-9-wash-trading--self-trading)
12. [Strategy 10: Behavioral Fingerprinting](#12-strategy-10-behavioral-fingerprinting)
13. [Composite Scoring Engine](#13-composite-scoring-engine)
14. [Alert Output Format](#14-alert-output-format)
15. [Implementation Notes](#15-implementation-notes)

---

## 1. Tổng Quan Hệ Thống

### Bối cảnh thực tế trên Hyperliquid

Hyperliquid là sàn perp DEX fully on-chain, nơi **mọi giao dịch đều công khai** bao gồm cả địa chỉ buyer và seller. Đây là lợi thế cực lớn so với CEX vì:

- Mỗi lệnh trade đều có field `users: [buyer, seller]` → biết chính xác ai mua, ai bán
- Toàn bộ lịch sử giao dịch, vị thế, PnL của mọi address đều query được
- Deposits, withdrawals, transfers giữa các ví đều transparent

### Các case thực tế đã xảy ra

**Case 1 - "Hyperliquid Whale" (Oct 2025):** Một ví mở short position $1.1B trên BTC+ETH chỉ 30 giờ trước khi Trump công bố thuế 100% hàng Trung Quốc. Whale thậm chí tăng thêm 200 BTC short chỉ **1 phút trước announcement**. Lãi ròng >$150M.

**Case 2 - Trump Crypto Reserve (Mar 2025):** Whale mở $200M leveraged long trên BTC+ETH. Vài giờ sau, Trump post trên Truth Social về US Strategic Crypto Reserve. BTC tăng 10%, ETH tăng 13%. Lãi ~$6.8M.

**Case 3 - HYPE pre-Robinhood listing:** Ví 0x082 tích lũy HYPE với 5x leverage **trước khi** Robinhood công bố listing.

### Pattern chung của Insider

```
1. Wallet mới hoặc ít hoạt động → nhận deposit lớn
2. Mở vị thế lớn bất thường (thường dùng leverage cao)
3. Timing cực kỳ chính xác trước event/announcement
4. Đóng vị thế ngay sau event, chốt lời
5. Rút tiền hoặc chuyển sang ví khác
6. Lặp lại pattern trên nhiều events
```

---

## 2. Nguồn Dữ Liệu từ Hyperliquid API

### 2.1. WebSocket Trades (Real-time Input)

```typescript
// Subscribe: { "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }

interface WsTrade {
  coin: string;           // "BTC", "ETH", "SOL"
  side: string;           // "B" (buy) or "A" (ask/sell)
  px: string;             // price
  sz: string;             // size
  hash: string;           // tx hash
  time: number;           // epoch ms
  tid: number;            // trade id
  users: [string, string] // ⭐ [buyer_address, seller_address]
}
```

**Đây là nguồn dữ liệu chính.** Mỗi trade cho ta biết ai mua, ai bán, ở giá nào, size bao nhiêu.

### 2.2. REST API - Trader Profile Data

| Endpoint | Mục đích | Dùng cho Strategy |
|----------|----------|-------------------|
| `clearinghouseState` | Account value, positions, margin | 4, 5, 7 |
| `userFills` | Lịch sử trade, closedPnl | 1, 2, 3, 4, 5, 7, 9 |
| `userFunding` | Funding payments | 5, 7 |
| `userNonFundingLedgerUpdates` | Deposits, withdrawals, transfers | 6, 8 |
| `openOrders` | Lệnh đang mở | 7, 8 |
| `spotClearinghouseState` | Spot balances | 3, 6 |
| `metaAndAssetCtxs` | Market data, funding rates, OI | 1, 3, 8 |
| `allMids` | Current prices | 1, 4 |
| `candleSnapshot` | Historical OHLCV | 1, 3 |

### 2.3. Data Collection Flow

```
WsTrade (real-time) → Extract addresses → Check cache
   │
   ├─ New address → Queue analysis job
   │     │
   │     ├─ Fetch clearinghouseState
   │     ├─ Fetch userFills (last 90 days)
   │     ├─ Fetch userFunding
   │     ├─ Fetch userNonFundingLedgerUpdates
   │     ├─ Fetch spotClearinghouseState
   │     └─ Assemble TraderProfile → Run all strategies
   │
   └─ Known address (cached) → Skip or update incrementally
```

---

## 3. Strategy 1: Pre-Event Timing Analysis

**Trọng số: 25/100 (cao nhất)**

Đây là strategy quan trọng nhất vì nó trực tiếp phản ánh hành vi insider — mở vị thế ngay trước sự kiện lớn.

### 3.1. Logic

```
Với mỗi trade của trader:
1. Ghi nhận: entry_time, entry_price, coin, side, size
2. Lấy giá sau 30m, 1h, 2h, 4h (từ candleSnapshot hoặc allMids)
3. Tính price_move = (future_price - entry_price) / entry_price
4. Nếu side = "B" (long) và price_move > +5% trong window → "favorable timing"
5. Nếu side = "A" (short) và price_move < -5% trong window → "favorable timing"
6. Tính timing_accuracy = favorable_trades / total_trades
```

### 3.2. Scoring

| Timing Accuracy | Score | Interpretation |
|----------------|-------|----------------|
| < 40% | 0 | Normal/random |
| 40% - 50% | 3 | Slightly above average |
| 50% - 60% | 8 | Notably good timing |
| 60% - 70% | 14 | Suspicious timing |
| 70% - 80% | 20 | Very suspicious |
| > 80% | 25 | Almost certainly informed trading |

### 3.3. Sub-signals (tăng thêm điểm)

- **Concentration around events:** Nếu >50% trades xảy ra trong ±2h quanh major price move (>3% trong 1h) → +5 bonus
- **Rapid exit:** Nếu trung bình thời gian giữ vị thế < 4h và PnL > 0 → +3 bonus
- **Scaling in before event:** Nếu thấy pattern tăng position size trong 1-4h trước price move → +5 bonus
- **Cross-asset timing:** Nếu timing accuracy cao trên nhiều coin khác nhau → +3 bonus

### 3.4. Implementation

```typescript
async analyzeTimming(fills: HlUserFill[], candles: Map<string, HlCandle[]>): Promise<StrategyResult> {
  let favorableCount = 0;
  let totalAnalyzed = 0;
  const flags: string[] = [];

  for (const fill of fills) {
    const futureCandles = candles.get(fill.coin)?.filter(c => 
      c.t > fill.time && c.t <= fill.time + 4 * 3600 * 1000
    );
    if (!futureCandles?.length) continue;

    totalAnalyzed++;
    const maxPrice = Math.max(...futureCandles.map(c => c.h));
    const minPrice = Math.min(...futureCandles.map(c => c.l));
    const entryPx = parseFloat(fill.px);

    if (fill.side === 'B') {
      const move = (maxPrice - entryPx) / entryPx;
      if (move > 0.05) favorableCount++;
    } else {
      const move = (entryPx - minPrice) / entryPx;
      if (move > 0.05) favorableCount++;
    }
  }

  const accuracy = totalAnalyzed > 0 ? favorableCount / totalAnalyzed : 0;
  // ... scoring logic
}
```

---

## 4. Strategy 2: Abnormal Win Rate Detection

**Trọng số: 20/100**

### 4.1. Logic

Trader bình thường có win rate khoảng 40-55%. Insider thường có win rate >75% vì họ biết trước hướng giá.

```
1. Lấy toàn bộ userFills
2. Nhóm fills thành "trades" (cùng coin, cùng direction, liên tiếp)
3. Tính closedPnl cho mỗi trade
4. Win = closedPnl > 0, Loss = closedPnl <= 0
5. Win rate = wins / total_trades
6. Tính thêm: profit factor = gross_profit / gross_loss
```

### 4.2. Scoring

| Metric | Threshold | Score |
|--------|-----------|-------|
| Win rate > 80%, trades >= 30 | Extreme | 20 |
| Win rate > 75%, trades >= 30 | Very high | 16 |
| Win rate > 70%, trades >= 20 | High | 12 |
| Win rate > 65%, trades >= 20 | Above average | 6 |
| Win rate > 60%, trades >= 20 | Slightly elevated | 3 |
| Win rate <= 60% | Normal | 0 |

### 4.3. Sub-signals

- **Profit factor > 5:** Lợi nhuận gấp 5 lần lỗ → +3
- **No losing streaks:** Không bao giờ thua >2 lệnh liên tiếp → +2
- **Win on large, lose on small:** Win trades có size trung bình > 3x losing trades → +3
- **Consistent across markets:** Win rate > 70% trên >3 coins khác nhau → +2

### 4.4. Anti-False-Positive

```
LOẠI TRỪ nếu:
- Trader có < 20 trades (mẫu quá nhỏ)
- Trader chỉ trade 1 coin (có thể là chuyên gia về coin đó)
- Average holding time > 7 ngày (position trader, không phải insider)
- Phần lớn trades là DCA nhỏ (< $100 mỗi trade)
```

---

## 5. Strategy 3: New Token / Low-Cap Sniping

**Trọng số: 20/100**

Insider thường biết trước token nào sắp được listing, partnership, hoặc có catalyst.

### 5.1. Logic

```
1. Từ metaAndAssetCtxs, xác định:
   - Token mới (listing time < 7 ngày)
   - Token volume thấp (24h volume < $500K)
   - Token OI thấp (open interest < $1M)

2. Kiểm tra userFills:
   - Trader có mua token X trước khi volume tăng >500%?
   - Trader có mua trong 24h đầu tiên sau listing?
   - Trader có mua nhiều low-cap tokens khác nhau và đều profitable?

3. "First mover" score:
   - Nếu trader là 1 trong 50 buyer đầu tiên trên token → first_mover = true
   - Track qua WsTrade realtime hoặc earliest fills từ userFills
```

### 5.2. Scoring

| Pattern | Score |
|---------|-------|
| First mover trên 3+ tokens, tất cả profitable | 20 |
| First mover trên 2+ tokens, >80% profitable | 16 |
| Mua low-cap trước volume spike, 3+ lần | 14 |
| Mua low-cap trước volume spike, 1-2 lần | 8 |
| Mua nhiều new tokens nhưng mixed results | 3 |
| Không trade low-cap | 0 |

### 5.3. Sub-signals

- **Buy-and-dump pattern:** Mua ngay sau listing, bán trong <24h với lãi → +5
- **Cross-token sniping:** Snipe thành công trên >5 tokens khác nhau → +5
- **Size escalation on new tokens:** Trade size lớn hơn bình thường khi trade new token → +3
- **Spot + Perp combo:** Mua spot token + đồng thời long perp → +2 (sophisticated insider)

### 5.4. Implementation Detail

```typescript
async analyzeNewTokenSniping(
  fills: HlUserFill[], 
  meta: HlMetaAndAssetCtxs
): Promise<StrategyResult> {
  // Identify low-cap assets
  const lowCapAssets = meta.assetCtxs.filter(ctx => 
    ctx.dayNtlVlm < 500_000 // < $500K daily volume
  );

  // Check if trader bought before volume spike
  const snipedTokens: string[] = [];
  for (const asset of lowCapAssets) {
    const assetFills = fills.filter(f => f.coin === asset.coin && f.side === 'B');
    if (assetFills.length === 0) continue;

    const firstBuyTime = Math.min(...assetFills.map(f => f.time));
    // Check if volume spiked after trader's first buy
    // (compare 24h volume before vs after first buy using candleSnapshot)
    // ...
  }
}
```

---

## 6. Strategy 4: Position Size Anomaly

**Trọng số: 15/100**

Insider khi "chắc chắn" sẽ đặt size lớn bất thường so với bình thường.

### 6.1. Logic

```
1. Tính baseline metrics từ userFills:
   - median_trade_size = median(all trade sizes in USD)
   - std_trade_size = standard deviation
   - average_leverage = mean leverage from positions

2. Xác định "anomaly trades":
   - Trade size > median + 3 * std (Z-score > 3)
   - Hoặc trade size > 5x median

3. Phân tích anomaly trades:
   - Bao nhiêu % anomaly trades có closedPnl > 0?
   - Anomaly trades có timing tốt hơn normal trades?
   - Có pattern: small → small → HUGE (profitable) → small?
```

### 6.2. Scoring

| Pattern | Score |
|---------|-------|
| >80% anomaly trades profitable + size >5x median | 15 |
| >70% anomaly trades profitable + size >3x median | 12 |
| >60% anomaly trades profitable + clear escalation pattern | 8 |
| Some anomaly trades profitable nhưng không consistent | 4 |
| Anomaly trades mixed hoặc losing | 0 |

### 6.3. Sub-signals

- **Leverage spike:** Dùng leverage cao bất thường (ví dụ: thường 5x, đột ngột 20-50x) trên winning trades → +3
- **All-in pattern:** >80% account value vào 1 trade, và trade đó win → +5
- **Size-timing correlation:** Trades lớn nhất cluster quanh major events → +3

### 6.4. Real-World Example

```
Trade history:
  Trade 1: $5K long ETH → +$200 (normal)
  Trade 2: $3K short BTC → -$150 (normal)
  Trade 3: $8K long SOL → +$400 (normal)
  Trade 4: $500K short BTC @ 40x leverage → +$150,000 (ANOMALY ⚠️)
  Trade 5: $4K long ETH → +$100 (back to normal)
  
→ Trade 4 là 100x median size, 40x leverage, perfectly timed
→ Pattern: normal → HUGE WIN → normal = strong insider signal
```

---

## 7. Strategy 5: PnL Consistency & Equity Curve

**Trọng số: 10/100**

### 7.1. Logic

Equity curve của trader bình thường có drawdowns rõ ràng. Insider thường có equity curve "staircase" — chỉ đi lên.

```
1. Reconstruct equity curve:
   - Start from earliest fill
   - Add closedPnl, subtract fees, add/subtract funding
   - Track cumulative PnL over time

2. Tính metrics:
   - Max drawdown (%) = largest peak-to-trough decline
   - Sortino ratio = return / downside_deviation
   - Win streak analysis
   - PnL consistency = std_dev(daily_pnl) / mean(daily_pnl)
```

### 7.2. Scoring

| Metric | Threshold | Score |
|--------|-----------|-------|
| Max drawdown < 5% + positive PnL, >30 trades | 10 |
| Max drawdown < 10% + Sortino > 3 | 8 |
| Max drawdown < 15% + consistent monthly profit | 5 |
| Max drawdown < 20% + mostly profitable | 3 |
| Normal drawdown pattern | 0 |

### 7.3. Sub-signals

- **Staircase pattern:** Equity curve chỉ có step-ups, gần như không có step-downs → +3
- **No consecutive losing days:** Không có 2 ngày thua liên tiếp trong >30 ngày → +2
- **Recovery speed:** Luôn recover từ drawdown trong <24h → +2

---

## 8. Strategy 6: Wallet Cluster & Fund Flow Analysis

**Trọng số: 10/100**

### 8.1. Logic

Insider thường sử dụng multiple wallets để phân tán risk và tránh detection.

```
1. Từ userNonFundingLedgerUpdates, track:
   - Nguồn deposit (từ đâu gửi tiền vào?)
   - Destination withdraw (rút tiền đi đâu?)
   - Internal transfers (chuyển giữa sub-accounts)

2. Pattern detection:
   - Nhiều wallets nhận deposit từ cùng 1 nguồn
   - Wallet mới tạo, nhận large deposit, trade ngay, rút ngay
   - Transfer chain: Source → Wallet A → Trade → Wallet B → CEX

3. Cross-reference:
   - So sánh deposit source với known project deployer addresses
   - So sánh trading patterns giữa các wallets liên quan
```

### 8.2. Scoring

| Pattern | Score |
|---------|-------|
| Wallet nhận funds từ known project/deployer wallet | 10 |
| Cluster 3+ wallets cùng pattern + cùng funding source | 8 |
| New wallet + large deposit + immediate profitable trade + quick withdrawal | 7 |
| Sub-account network với suspicious timing correlation | 5 |
| Single deposit → trade → withdraw (one-shot wallet) | 4 |
| Normal funding pattern | 0 |

### 8.3. Red Flags

```
⚠️ Wallet age < 7 ngày + deposit > $50K + trade > $100K
⚠️ Deposit ngay trước major trade (< 1h gap)
⚠️ Withdraw toàn bộ funds ngay sau profitable trade (< 2h gap)
⚠️ Multiple wallets cùng trade cùng coin, cùng direction, cùng time window
⚠️ Funds routed through bridges hoặc privacy protocols trước khi deposit
```

---

## 9. Strategy 7: Leverage Conviction Pattern

**Trọng số: 10/100**

### 9.1. Logic

Insider khi có thông tin chắc chắn sẽ dùng leverage cực cao — điều mà trader bình thường không dám làm vì risk of liquidation.

```
1. Từ clearinghouseState → track leverage usage per position
2. Từ userFills → correlate leverage with outcome

3. Phân tích:
   - Average leverage trên winning trades vs losing trades
   - Có pattern dùng 20-50x leverage chỉ trước major moves?
   - Max leverage ever used → kết quả thế nào?
```

### 9.2. Scoring

| Pattern | Score |
|---------|-------|
| Leverage 20x+ chỉ dùng trước profitable moves (>80% accuracy) | 10 |
| Leverage tăng 3x+ so với average trên winning trades | 7 |
| High leverage trades (>10x) có win rate > 75% | 5 |
| Leverage usage consistent, không phân biệt win/loss | 0 |

### 9.3. Real-World Pattern (Hyperliquid Whale case)

```
Timeline:
  Day 1: Deposit $4M USDC
  Day 1: Open 50x LONG BTC + ETH ($200M notional)
  Day 2: Trump tweets about Crypto Reserve
  Day 2: BTC +10%, ETH +13%
  Day 2: Close all → profit $6.8M
  Day 3: Withdraw $10.8M

→ 50x leverage + perfect timing + quick exit = maximum insider score
```

---

## 10. Strategy 8: Liquidation Front-Running

**Trọng số: 5/100** (bonus)

### 10.1. Logic

Một dạng insider đặc biệt: biết trước sẽ có cascade liquidation (vì biết về market-moving event).

```
1. Monitor funding rates từ metaAndAssetCtxs
2. Detect khi market extremely leveraged (high OI + extreme funding)
3. Flag traders mở counter-position trước liquidation cascade:
   - Market long-heavy → trader opens large short → cascade liquidation xảy ra
   - Market short-heavy → trader opens large long → short squeeze
```

### 10.2. Scoring

| Pattern | Score |
|---------|-------|
| Opens counter-position <1h before cascade, >$500K size | 5 |
| Opens counter-position <4h before cascade, >$100K size | 3 |
| Pattern repeats 2+ times | +3 bonus |

---

## 11. Strategy 9: Wash Trading / Self-Trading Detection

**Trọng số: 5/100** (bonus)

### 11.1. Logic

Dùng field `users: [buyer, seller]` trong WsTrade để detect:

```
1. Self-trading: buyer_address === seller_address
   (thông qua sub-accounts hoặc API wallets)

2. Circular trading: 
   Wallet A sells to Wallet B → Wallet B sells to Wallet A

3. Artificial volume:
   Repeated trades cùng size, cùng price, giữa cùng 2 wallets
```

### 11.2. Scoring

| Pattern | Score |
|---------|-------|
| Clear self-trading detected | 5 |
| Circular trading between related wallets | 4 |
| Suspicious volume concentration between few addresses | 3 |

### 11.3. Implementation

```typescript
// From WsTrade stream, build adjacency map
const tradeMap = new Map<string, Map<string, number>>(); // buyer → seller → count

for (const trade of trades) {
  const [buyer, seller] = trade.users;
  
  // Self-trade check
  if (buyer === seller) {
    flagSelfTrade(buyer, trade);
    continue;
  }
  
  // Circular trade check
  const reverseCount = tradeMap.get(seller)?.get(buyer) || 0;
  const forwardCount = (tradeMap.get(buyer)?.get(seller) || 0) + 1;
  
  if (reverseCount > 3 && forwardCount > 3) {
    flagCircularTrade(buyer, seller, trade);
  }
}
```

---

## 12. Strategy 10: Behavioral Fingerprinting

**Trọng số: 5/100** (bonus)

### 12.1. Logic

Phát hiện insider qua hành vi bất thường so với "trader bình thường":

```
1. Trading hours: Insider thường trade ở giờ bất thường (không theo timezone pattern)
2. Reaction time: Entry → event gap cực ngắn (<5 min) gợi ý auto-execution
3. Asset diversity: Đột nhiên trade asset chưa bao giờ trade trước đó
4. Activity gaps: Dormant wallet đột nhiên active, trade lớn, rồi dormant lại
```

### 12.2. Scoring

| Pattern | Score |
|---------|-------|
| Dormant (>30 days) → large trade → profitable → dormant | 5 |
| Trades ONLY before events, silent otherwise | 4 |
| First-ever trade trên 1 coin + win big | 3 |
| Activity pattern matches another flagged wallet | 3 |

### 12.3. "Ghost Wallet" Detection

```
Đặc điểm Ghost Wallet (likely insider):
- Wallet age < 14 ngày
- Chỉ có 1-3 deposit transactions
- Chỉ trade 1-2 coins
- 100% win rate
- Rút toàn bộ funds sau khi profitable
- Tổng lifetime < 7 ngày active

→ Highly likely: created specifically for insider trade, then abandoned
```

---

## 13. Composite Scoring Engine

### 13.1. Score Weights

```typescript
interface InsiderScore {
  address: string;
  
  // Core strategies (80/100)
  timingScore: number;        // 0-25 (Strategy 1)
  winRateScore: number;       // 0-20 (Strategy 2)
  newTokenScore: number;      // 0-20 (Strategy 3)
  sizeAnomalyScore: number;   // 0-15 (Strategy 4)

  // Supporting strategies (20/100)
  pnlConsistencyScore: number; // 0-10 (Strategy 5)
  walletClusterScore: number;  // 0-10 (Strategy 6)
  
  // Bonus strategies (up to +25 bonus)
  leverageConvictionBonus: number;  // 0-10 (Strategy 7)
  liquidationFrontrunBonus: number; // 0-5  (Strategy 8)
  washTradingBonus: number;         // 0-5  (Strategy 9)
  behaviorBonus: number;            // 0-5  (Strategy 10)

  // Computed
  baseScore: number;          // Sum of core + supporting (max 100)
  bonusScore: number;         // Sum of bonuses (max 25)
  totalScore: number;         // baseScore + bonusScore (capped at 100)
  
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' | 'CRITICAL';
  flags: string[];
  tradeCount: number;
  totalPnl: number;
  accountValue: number;
  analyzedAt: Date;
}
```

### 13.2. Confidence Levels

```
CRITICAL  (score >= 80): 🔴 Gần như chắc chắn insider. Alert ngay lập tức.
VERY_HIGH (score >= 65): 🟠 Rất có khả năng insider. Alert + deep investigation.
HIGH      (score >= 50): 🟡 Có nhiều dấu hiệu insider. Alert + monitor.
MEDIUM    (score >= 35): 🔵 Có một số dấu hiệu bất thường. Log + watchlist.
LOW       (score <  35): ⚪ Có thể là trader giỏi. Log only.
```

### 13.3. Multi-Strategy Correlation Bonus

```
Khi nhiều strategies cùng flag 1 address → tăng confidence:

- 2 core strategies flag → totalScore × 1.1
- 3 core strategies flag → totalScore × 1.2  
- 4 core strategies flag → totalScore × 1.3
- Timing + Size Anomaly cùng flag → +5 (strong insider signal)
- Timing + New Token cùng flag → +5 (listing insider)
- Win Rate + PnL Consistency cùng flag → +3 (consistent insider)
```

### 13.4. Score Calculation

```typescript
function calculateInsiderScore(results: StrategyResult[]): InsiderScore {
  // 1. Sum base scores
  let baseScore = results
    .filter(r => r.category === 'core' || r.category === 'supporting')
    .reduce((sum, r) => sum + r.score, 0);
  
  // 2. Sum bonus scores
  let bonusScore = results
    .filter(r => r.category === 'bonus')
    .reduce((sum, r) => sum + r.score, 0);
  
  // 3. Count flagged core strategies
  const flaggedCoreCount = results
    .filter(r => r.category === 'core' && r.score > 0).length;
  
  // 4. Apply correlation multiplier
  const multiplier = 1 + (Math.max(0, flaggedCoreCount - 1) * 0.1);
  baseScore = Math.min(100, Math.round(baseScore * multiplier));
  
  // 5. Apply specific correlation bonuses
  const hasTimingFlag = results.find(r => r.name === 'timing')?.score > 0;
  const hasSizeFlag = results.find(r => r.name === 'sizeAnomaly')?.score > 0;
  const hasNewTokenFlag = results.find(r => r.name === 'newToken')?.score > 0;
  
  if (hasTimingFlag && hasSizeFlag) bonusScore += 5;
  if (hasTimingFlag && hasNewTokenFlag) bonusScore += 5;
  
  // 6. Final score
  const totalScore = Math.min(100, baseScore + bonusScore);
  
  // 7. Determine confidence
  const confidence = totalScore >= 80 ? 'CRITICAL'
    : totalScore >= 65 ? 'VERY_HIGH'
    : totalScore >= 50 ? 'HIGH'
    : totalScore >= 35 ? 'MEDIUM'
    : 'LOW';
  
  return { totalScore, baseScore, bonusScore, confidence, /* ... */ };
}
```

---

## 14. Alert Output Format

### 14.1. Telegram Alert Template

```
🔴 INSIDER ALERT - CRITICAL (Score: 87/100)

📍 Address: 0xABC...DEF
🔗 https://app.hyperliquid.xyz/explorer/address/0xABC...DEF

💰 Account Value: $1,250,000
📊 Total PnL (90d): +$890,000
🎯 Win Rate: 92% (38/41 trades)

━━━ SCORE BREAKDOWN ━━━
⏱ Timing:          23/25  ██████████████░
🏆 Win Rate:        18/20  █████████████░░
🆕 New Token:       14/20  ██████████░░░░░
📏 Size Anomaly:    12/15  ████████████░░░
📈 PnL Consistency:  8/10  ████████████░░░
🔗 Wallet Cluster:   6/10  █████████░░░░░░
🔧 Leverage Bonus:   6/10  ████████░░░░░░░

━━━ FLAGS ━━━
🚩 PERFECT_TIMING_BEFORE_EVENTS (8 of 10 trades)
🚩 ABNORMAL_WIN_RATE_92%
🚩 FIRST_MOVER_ON_3_TOKENS (XYZ, ABC, DEF)
🚩 SIZE_5X_MEDIAN_ON_WINNERS
🚩 GHOST_WALLET (age: 5 days, 1 deposit source)
🚩 50X_LEVERAGE_ONLY_ON_WINNERS

━━━ RECENT TRADES ━━━
• 2h ago: LONG SOL $500K @$148 (40x) → price now $162 (+9.5%)
• 1d ago: SHORT ETH $300K @$3,200 (20x) → closed +$45K
• 3d ago: LONG HYPE $200K @$28 (10x) → closed +$120K

⏰ Analyzed: 2026-02-26 14:30:00 UTC
```

### 14.2. Structured JSON Output (for API/Dashboard)

```json
{
  "address": "0xABC...DEF",
  "totalScore": 87,
  "confidence": "CRITICAL",
  "baseScore": 81,
  "bonusScore": 6,
  "strategies": {
    "timing": { "score": 23, "max": 25, "flags": ["PERFECT_TIMING_BEFORE_EVENTS"] },
    "winRate": { "score": 18, "max": 20, "flags": ["ABNORMAL_WIN_RATE_92%"] },
    "newToken": { "score": 14, "max": 20, "flags": ["FIRST_MOVER_ON_3_TOKENS"] },
    "sizeAnomaly": { "score": 12, "max": 15, "flags": ["SIZE_5X_MEDIAN_ON_WINNERS"] },
    "pnlConsistency": { "score": 8, "max": 10, "flags": [] },
    "walletCluster": { "score": 6, "max": 10, "flags": ["GHOST_WALLET"] },
    "leverageConviction": { "score": 6, "max": 10, "flags": ["50X_LEVERAGE_ONLY_ON_WINNERS"] }
  },
  "traderProfile": {
    "accountValue": 1250000,
    "totalPnl90d": 890000,
    "winRate": 0.92,
    "totalTrades": 41,
    "avgHoldingTime": "3.2h",
    "walletAge": "5 days",
    "topCoins": ["SOL", "ETH", "HYPE"]
  },
  "analyzedAt": "2026-02-26T14:30:00Z"
}
```

---

## 15. Implementation Notes

### 15.1. Thứ Tự Ưu Tiên Khi Build

```
Phase 1 (MVP - tuần 1):
  ✅ WebSocket connection + trade parsing
  ✅ Address extraction + deduplication
  ✅ Strategy 2 (Win Rate) - dễ nhất, data sẵn từ userFills
  ✅ Strategy 4 (Size Anomaly) - tính từ userFills
  ✅ Basic Telegram alert

Phase 2 (Core - tuần 2):
  ✅ Strategy 1 (Timing) - cần candleSnapshot data
  ✅ Strategy 6 (Wallet Cluster) - cần ledger data
  ✅ Strategy 7 (Leverage) - cần clearinghouseState
  ✅ Scoring engine + correlation bonuses
  ✅ Database persistence

Phase 3 (Advanced - tuần 3):
  ✅ Strategy 3 (New Token) - cần metaAndAssetCtxs tracking
  ✅ Strategy 5 (PnL Consistency) - equity curve reconstruction
  ✅ Strategy 8 (Liquidation Frontrun) - cần OI + funding monitoring
  ✅ Strategy 9 (Wash Trading) - real-time từ WsTrade stream
  ✅ Strategy 10 (Behavioral) - aggregation over time

Phase 4 (Optimization - ongoing):
  ✅ Backtest scoring on known insider addresses
  ✅ Fine-tune thresholds
  ✅ Dashboard / API
  ✅ Historical backfill analysis
```

### 15.2. Rate Limiting Strategy

```
Hyperliquid: ~1200 requests/minute

Budget allocation:
- clearinghouseState: 1 call/address
- userFills: 1-3 calls/address (paginated)  
- userFunding: 1 call/address
- userNonFundingLedger: 1 call/address
- candleSnapshot: 1 call/coin (cached, shared)
- metaAndAssetCtxs: 1 call/minute (cached, global)

→ ~6-8 calls per new address
→ Max ~150 new addresses analyzed/minute
→ Use Bull queue with rate limiter:
   { limiter: { max: 20, duration: 60000 } }
```

### 15.3. Caching Strategy

```
Redis caching:
- Trader analysis result: TTL 5-10 minutes (avoid re-analyzing)
- allMids: TTL 5 seconds (prices change fast)
- metaAndAssetCtxs: TTL 60 seconds
- candleSnapshot: TTL 60 seconds per coin
- Known "clean" addresses (market makers, vaults): TTL 24h
```

### 15.4. Known Addresses to Exclude

```
Loại trừ khỏi analysis:
- Hyperliquid Vault addresses (HLP, etc.)
- Known market maker addresses
- Addresses với > 10,000 trades/day (bots/MM)
- Addresses on Hyperliquid leaderboard (public traders)

Có thể maintain whitelist trong database hoặc config.
```

### 15.5. False Positive Mitigation

```
Để giảm false positive:
1. Minimum trade count: Chỉ analyze nếu trader có >= 15-20 trades
2. Minimum account value: Bỏ qua accounts < $1,000 (noise)
3. Time window: Chỉ analyze fills trong 90 ngày gần nhất
4. Multi-strategy requirement: Chỉ alert nếu >= 2 core strategies flag
5. Manual review queue: HIGH/VERY_HIGH vào review queue trước khi CRITICAL alert
6. Decay factor: Score giảm dần nếu không có suspicious activity mới
```

### 15.6. Backtesting Against Known Cases

```
Sử dụng các case đã biết để validate scoring:

Known Insider Addresses (public):
1. "Hyperliquid Whale" - 0xf3F4... (BTC short pre-tariff)
2. "50x Trump Reserve" - 0xe4d3... (long pre-announcement)  
3. "HYPE Robinhood" - 0x082... (HYPE pre-listing)

Expected: Tất cả nên có score >= 70 (VERY_HIGH hoặc CRITICAL)

Kiểm tra:
- Nếu known insiders score < 50 → thresholds quá strict
- Nếu nhiều random traders score > 50 → thresholds quá loose
- Tune cho đến khi known insiders ở top 1% scoring distribution
```
