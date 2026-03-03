# Strategy: Fresh Deposit → Immediate Large Trade Detection

## Bản Chất Của Strategy Này

Đây là pattern cổ điển nhất của insider trading trên Hyperliquid:

```
Insider biết trước thông tin → Tạo ví mới / dùng ví sạch
→ Bridge USDC vào Hyperliquid → Mở lệnh lớn ngay lập tức
→ Event xảy ra, giá di chuyển → Chốt lời → Rút tiền
```

**Tại sao pattern này đáng tin cậy:**
- Trader bình thường nạp tiền vào rồi trade dần dần, không all-in ngay
- Insider cần nhanh vì thông tin có thể bị leak, nên deposit → trade cực nhanh
- Ví chỉ có deposit (không có lịch sử) = "ví dùng 1 lần" = cố tình ẩn danh

---

## 1. Trade Aggregation (Gộp fills thành lệnh gốc)

### 1.1. Vấn đề: 1 lệnh lớn = nhiều WsTrade nhỏ

Khi trader đặt 1 lệnh lớn trên Hyperliquid, orderbook match nó với **nhiều resting orders** khác nhau. WebSocket trả về **nhiều WsTrade messages riêng lẻ** — mỗi message là 1 fill nhỏ.

**Nếu không gộp → BỎ LỌT lệnh lớn:**

```
Trader 0xABC mở LONG BTC $500K notional
→ Orderbook match với 8 resting orders
→ WebSocket trả về 8 fills riêng lẻ:

fill 1: { users: ["0xABC","0x111"], coin:"BTC", side:"B", px:"95000", sz:"0.5",  time: 1709000000100, tid: 1 }
fill 2: { users: ["0xABC","0x222"], coin:"BTC", side:"B", px:"95001", sz:"0.8",  time: 1709000000100, tid: 2 }
fill 3: { users: ["0xABC","0x333"], coin:"BTC", side:"B", px:"95002", sz:"0.3",  time: 1709000000100, tid: 3 }
fill 4: { users: ["0xABC","0x444"], coin:"BTC", side:"B", px:"95003", sz:"1.2",  time: 1709000000100, tid: 4 }
fill 5: { users: ["0xABC","0x555"], coin:"BTC", side:"B", px:"95005", sz:"0.6",  time: 1709000000100, tid: 5 }
fill 6: { users: ["0xABC","0x666"], coin:"BTC", side:"B", px:"95006", sz:"0.9",  time: 1709000000100, tid: 6 }
fill 7: { users: ["0xABC","0x777"], coin:"BTC", side:"B", px:"95008", sz:"0.5",  time: 1709000000100, tid: 7 }
fill 8: { users: ["0xABC","0x888"], coin:"BTC", side:"B", px:"95010", sz:"0.4",  time: 1709000000100, tid: 8 }

Mỗi fill riêng lẻ: $47K - $114K → KHÔNG vượt threshold $500K → BỎ LỌT ❌
Sau khi gộp:        5.2 BTC × ~$95,004 avg = ~$494K → GẦN threshold → DETECT ✅
```

### 1.2. Aggregation Key

Gộp fills theo composite key: **`trader_address + coin + side`** trong cùng **time window**.

```typescript
// Aggregation key = trader + coin + side (direction)
type AggKey = `${string}:${string}:${'B' | 'A'}`;
// Ví dụ: "0xABC...DEF:BTC:B" = trader 0xABC mua BTC

function makeAggKey(address: string, coin: string, side: 'B' | 'A'): AggKey {
  return `${address}:${coin}:${side}`;
}
```

**Tại sao cần cả `side`:**
- Cùng 1 trader, cùng 1 coin, nhưng khác chiều = 2 lệnh khác nhau
- Ví dụ: trader vừa close SHORT (side B) vừa open LONG (side B) → cùng side thì gộp OK
- Nhưng nếu trader đồng thời short ETH (side A) và long BTC (side B) → 2 key riêng

**Chú ý quan trọng về `users` field:**
- `users: [buyer, seller]` — buyer ở index 0, seller ở index 1
- Với `side: "B"` (buy) → buyer = `users[0]` là taker (người mở lệnh), seller = `users[1]` là maker
- Với `side: "A"` (sell) → mỗi fill vẫn có buyer/seller, nhưng **taker** (người gửi lệnh bán) là `users[1]`
- **QUAN TRỌNG:** Cùng 1 crossing order, buyer address trong `users[0]` luôn là người BUY, seller trong `users[1]` luôn là người SELL
- Vì 1 lệnh market buy match với nhiều resting sell orders → `users[0]` (buyer) giống nhau ở tất cả fills, `users[1]` (seller) khác nhau mỗi fill — đây chính là dấu hiệu để nhận biết gộp

```
fill 1: users: ["0xABC", "0x111"]  ← 0xABC là buyer (giống nhau)
fill 2: users: ["0xABC", "0x222"]  ← 0xABC là buyer (giống nhau)  
fill 3: users: ["0xABC", "0x333"]  ← 0xABC là buyer (giống nhau)
→ Gộp: 0xABC đang MUA (LONG), tổng size = fill1 + fill2 + fill3

fill 4: users: ["0x444", "0xDEF"]  ← 0xDEF là seller (giống nhau)
fill 5: users: ["0x555", "0xDEF"]  ← 0xDEF là seller (giống nhau)
→ Gộp: 0xDEF đang BÁN (SHORT), tổng size = fill4 + fill5
```

### 1.3. Aggregation Window

Fills thuộc cùng 1 lệnh gốc thường đến **trong cùng 1 block** (cùng `time` ms) hoặc cách nhau rất ngắn. Dùng **time-based window** để gộp:

```typescript
interface AggregationConfig {
  windowMs: number;        // Thời gian chờ gộp (ms)
  // Fills cùng key trong window này được coi là 1 lệnh

  // Recommended values:
  // - 200ms: aggressive, có thể miss fills đến chậm
  // - 500ms: balanced ✅ (recommended)
  // - 1000ms: conservative, có thể gộp nhầm 2 lệnh riêng biệt
}
```

**Tại sao 500ms là hợp lý:**
- Hyperliquid block time ~1-2 giây, nhưng fills từ cùng 1 crossing order thường cùng `time` (ms)
- WebSocket có thể delivery fills với độ trễ nhỏ (~50-200ms) do network
- 500ms đủ rộng để gom hết fills cùng lệnh, đủ hẹp để không gộp nhầm 2 lệnh liên tiếp

**Edge case:** Trader đặt 2 lệnh liên tiếp (cách nhau <500ms, cùng coin cùng chiều)?
- Rất hiếm đối với insider (họ thường đặt 1 lệnh lớn duy nhất)
- Nếu xảy ra, gộp chung cũng OK — tổng size vẫn phản ánh đúng exposure thực tế
- Worst case: gộp 2 lệnh $250K thành 1 lệnh $500K → vượt threshold → phân tích thêm → không harmful

### 1.4. Data Structures

```typescript
/**
 * Raw fill từ WebSocket
 */
interface WsTrade {
  coin: string;
  side: 'B' | 'A';       // B = buy, A = sell
  px: string;             // price (string!)
  sz: string;             // size in base asset (string!)
  hash: string;
  time: number;           // epoch ms
  tid: number;            // trade id, unique per fill
  users: [string, string]; // [buyer_address, seller_address]
}

/**
 * Aggregated order — kết quả sau khi gộp nhiều fills
 */
interface AggregatedOrder {
  // Identity
  traderAddress: string;
  coin: string;
  side: 'B' | 'A';
  direction: 'LONG' | 'SHORT';  // B = LONG, A = SHORT

  // Aggregated values
  totalSz: number;              // tổng size (base asset)
  totalNotional: number;         // tổng notional USD (sum of px × sz per fill)
  avgPx: number;                 // VWAP = totalNotional / totalSz
  fillCount: number;             // số fills được gộp

  // Time range
  firstFillTime: number;         // time của fill đầu tiên
  lastFillTime: number;          // time của fill cuối cùng

  // Raw fills (giữ lại để debug)
  fills: WsTrade[];

  // Counterparties (đối tác - các maker bị match)
  counterparties: string[];      // danh sách các address đối diện
}
```

### 1.5. TradeAggregator Service (Complete Implementation)

```typescript
@Injectable()
export class TradeAggregatorService {
  // Pending aggregations: key → accumulator
  private pending: Map<AggKey, AggregatedOrder> = new Map();

  // Timers cho mỗi aggregation window
  private timers: Map<AggKey, NodeJS.Timeout> = new Map();

  private readonly WINDOW_MS = 500; // 500ms aggregation window

  constructor(
    private readonly thresholdService: ThresholdService,
    private readonly analysisQueue: AnalysisQueueService,
  ) {}

  /**
   * Gọi mỗi khi nhận 1 WsTrade từ WebSocket.
   * KHÔNG check threshold ở đây — chỉ gộp.
   * Threshold check xảy ra khi window đóng (onWindowClose).
   */
  onTrade(trade: WsTrade): void {
    const px = parseFloat(trade.px);
    const sz = parseFloat(trade.sz);
    const fillNotional = px * sz;

    // Mỗi fill có 2 bên: buyer (users[0]) và seller (users[1])
    // Cần gộp cho CẢ HAI bên
    this.accumulate(trade.users[0], trade, 'B', px, sz, fillNotional, trade.users[1]);
    this.accumulate(trade.users[1], trade, 'A', px, sz, fillNotional, trade.users[0]);
  }

  /**
   * Tích luỹ fill vào aggregation bucket
   */
  private accumulate(
    traderAddress: string,
    trade: WsTrade,
    traderSide: 'B' | 'A',   // side của TRADER này (B nếu là buyer, A nếu là seller)
    px: number,
    sz: number,
    fillNotional: number,
    counterparty: string,
  ): void {
    const key = makeAggKey(traderAddress, trade.coin, traderSide);

    if (this.pending.has(key)) {
      // Đã có bucket → thêm fill vào
      const agg = this.pending.get(key)!;
      agg.totalSz += sz;
      agg.totalNotional += fillNotional;
      agg.avgPx = agg.totalNotional / agg.totalSz;
      agg.fillCount += 1;
      agg.lastFillTime = trade.time;
      agg.fills.push(trade);
      if (!agg.counterparties.includes(counterparty)) {
        agg.counterparties.push(counterparty);
      }

      // Reset timer — mỗi fill mới gia hạn window thêm WINDOW_MS
      // (sliding window approach)
      this.resetTimer(key);
    } else {
      // Tạo bucket mới
      const agg: AggregatedOrder = {
        traderAddress,
        coin: trade.coin,
        side: traderSide,
        direction: traderSide === 'B' ? 'LONG' : 'SHORT',
        totalSz: sz,
        totalNotional: fillNotional,
        avgPx: px,
        fillCount: 1,
        firstFillTime: trade.time,
        lastFillTime: trade.time,
        fills: [trade],
        counterparties: [counterparty],
      };
      this.pending.set(key, agg);
      this.resetTimer(key);
    }
  }

  /**
   * Reset (hoặc tạo mới) timer cho aggregation key.
   * Khi timer fire → window đóng → emit aggregated order.
   *
   * Dùng SLIDING WINDOW: mỗi fill mới reset timer.
   * Nghĩa là nếu fills liên tục đến cách nhau <500ms, 
   * window tiếp tục mở rộng cho đến khi ngừng fill 500ms.
   *
   * Thêm MAX_WINDOW để tránh window mở vô hạn.
   */
  private readonly MAX_WINDOW_MS = 3000; // tối đa 3 giây

  private resetTimer(key: AggKey): void {
    // Clear timer cũ
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);

    const agg = this.pending.get(key)!;
    const elapsed = Date.now() - agg.firstFillTime;

    if (elapsed >= this.MAX_WINDOW_MS) {
      // Đã mở quá lâu → force close ngay
      this.onWindowClose(key);
      return;
    }

    // Tính remaining time (không vượt MAX_WINDOW)
    const remaining = Math.min(this.WINDOW_MS, this.MAX_WINDOW_MS - elapsed);

    const timer = setTimeout(() => {
      this.onWindowClose(key);
    }, remaining);

    this.timers.set(key, timer);
  }

  /**
   * Window đóng → kiểm tra threshold → queue analysis nếu cần.
   */
  private onWindowClose(key: AggKey): void {
    const agg = this.pending.get(key);
    if (!agg) return;

    // Cleanup
    this.pending.delete(key);
    this.timers.delete(key);

    // BÂY GIỜ mới check threshold với TỔNG notional đã gộp
    const shouldAnalyze = this.thresholdService.shouldAlert(agg.coin, agg.totalNotional);

    if (shouldAnalyze) {
      this.analysisQueue.enqueue(agg);
    }

    // Log cho monitoring (kể cả không vượt threshold)
    if (agg.fillCount > 1) {
      // Chỉ log nếu có gộp (>1 fill) để giảm noise
      logger.debug(
        `Aggregated ${agg.fillCount} fills: ` +
        `${agg.traderAddress.slice(0,8)} ${agg.direction} ${agg.coin} ` +
        `$${agg.totalNotional.toLocaleString()} ` +
        `(${agg.totalSz} @ ${agg.avgPx.toFixed(2)}) ` +
        `${shouldAnalyze ? '→ QUEUED' : '→ below threshold'}`
      );
    }
  }

  /**
   * Cleanup khi module destroy
   */
  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    this.timers.clear();
  }
}
```

### 1.6. Ví Dụ Aggregation Thực Tế

**Case 1: Market buy BTC lớn — 8 fills cùng block**

```
Input (8 WsTrade messages, cùng time = 1709000000100):

fill 1: { coin:"BTC", side:"B", px:"95000", sz:"0.50", users:["0xABC","0x111"], time:...100 }
fill 2: { coin:"BTC", side:"B", px:"95001", sz:"0.80", users:["0xABC","0x222"], time:...100 }
fill 3: { coin:"BTC", side:"B", px:"95002", sz:"0.30", users:["0xABC","0x333"], time:...100 }
fill 4: { coin:"BTC", side:"B", px:"95003", sz:"1.20", users:["0xABC","0x444"], time:...100 }
fill 5: { coin:"BTC", side:"B", px:"95005", sz:"0.60", users:["0xABC","0x555"], time:...100 }
fill 6: { coin:"BTC", side:"B", px:"95006", sz:"0.90", users:["0xABC","0x666"], time:...100 }
fill 7: { coin:"BTC", side:"B", px:"95008", sz:"0.50", users:["0xABC","0x777"], time:...100 }
fill 8: { coin:"BTC", side:"B", px:"95010", sz:"0.40", users:["0xABC","0x888"], time:...100 }

Output (1 AggregatedOrder sau 500ms window):

{
  traderAddress: "0xABC",
  coin: "BTC",
  side: "B",
  direction: "LONG",
  totalSz: 5.20,
  totalNotional: 494_015.6,    // sum(px × sz per fill)
  avgPx: 95_003.0,             // VWAP = 494015.6 / 5.20
  fillCount: 8,
  firstFillTime: 1709000000100,
  lastFillTime: 1709000000100,
  counterparties: ["0x111","0x222","0x333","0x444","0x555","0x666","0x777","0x888"],
}

→ $494K gần threshold $500K BLUECHIP → tuỳ config có thể trigger
```

**Case 2: TWAP/Iceberg — fills rải ra nhiều block**

```
Trader dùng TWAP split $300K thành 6 lệnh nhỏ, mỗi 5 giây:

fill 1: { coin:"ETH", px:"3500", sz:"2.0",  users:["0xDEF","0x..."], time: T+0ms    }
fill 2: { coin:"ETH", px:"3501", sz:"1.8",  users:["0xDEF","0x..."], time: T+5000ms  }
fill 3: { coin:"ETH", px:"3502", sz:"2.2",  users:["0xDEF","0x..."], time: T+10000ms }
fill 4: { coin:"ETH", px:"3503", sz:"1.5",  users:["0xDEF","0x..."], time: T+15000ms }
fill 5: { coin:"ETH", px:"3501", sz:"2.8",  users:["0xDEF","0x..."], time: T+20000ms }
fill 6: { coin:"ETH", px:"3502", sz:"1.7",  users:["0xDEF","0x..."], time: T+25000ms }

Với WINDOW_MS=500ms, MAX_WINDOW_MS=3000ms:
→ Mỗi fill cách nhau 5s > 500ms window
→ Kết quả: 6 AggregatedOrder RIÊNG, mỗi cái ~$6K-$10K
→ KHÔNG vượt threshold → KHÔNG alert

Insider KHÔNG dùng TWAP (quá chậm, thông tin có thể bị leak) → đây là behavior bình thường.
Nếu muốn detect TWAP insider, cần thêm 1 layer rolling window dài hơn (xem mục 1.7).
```

**Case 3: Altcoin volume thấp — 2 fills nhỏ nhưng coin chết**

```
fill 1: { coin:"RANDOMALT", px:"0.045", sz:"300000", users:["0xGHI","0x..."], time: T }
fill 2: { coin:"RANDOMALT", px:"0.046", sz:"200000", users:["0xGHI","0x..."], time: T }

Aggregated:
  totalSz: 500,000 RANDOMALT
  totalNotional: 300000×0.045 + 200000×0.046 = $22,700
  coin tier: MICRO_CAP (dayNtlVlm = $8,000)
  threshold: $10,000

→ $22,700 > $10,000 threshold → TRIGGER analysis
→ Trade chiếm 283% daily volume → cực kỳ khả nghi
```

### 1.7. Rolling Window cho TWAP/Split Orders (Layer 2 — Optional)

Ngoài aggregation 500ms cho fills cùng lệnh, thêm **rolling window 60 giây** để catch trader chia nhỏ lệnh:

```typescript
/**
 * Layer 2: Rolling window tracker
 * Gom tổng notional của 1 trader trên 1 coin trong 60 giây gần nhất.
 * Phát hiện trường hợp chia nhỏ lệnh (split/TWAP) để lách threshold.
 */
@Injectable()
export class RollingWindowTracker {
  // key: "address:coin" → sliding window of aggregated orders
  private windows: Map<string, { time: number; notional: number }[]> = new Map();

  private readonly ROLLING_WINDOW_MS = 60_000; // 60 giây

  /**
   * Gọi sau mỗi AggregatedOrder (output từ TradeAggregatorService).
   * Kiểm tra xem tổng notional 60s qua có vượt threshold không.
   */
  onAggregatedOrder(order: AggregatedOrder): boolean {
    // Key KHÔNG bao gồm side — track tổng exposure cả long + short
    // (Insider có thể chia nhỏ nhưng cùng chiều)
    // Nhưng nếu muốn chặt hơn, có thể thêm side vào key
    const key = `${order.traderAddress}:${order.coin}`;

    if (!this.windows.has(key)) {
      this.windows.set(key, []);
    }

    const window = this.windows.get(key)!;
    window.push({ time: order.lastFillTime, notional: order.totalNotional });

    // Cleanup entries ngoài window
    const cutoff = Date.now() - this.ROLLING_WINDOW_MS;
    const filtered = window.filter(w => w.time > cutoff);
    this.windows.set(key, filtered);

    // Tổng notional trong 60s
    const rollingTotal = filtered.reduce((sum, w) => sum + w.notional, 0);

    return this.thresholdService.shouldAlert(order.coin, rollingTotal);
  }
}
```

**Ví dụ:** Trader chia $500K BTC thành 10 lệnh $50K, mỗi 5 giây:
- Layer 1 (500ms): mỗi lệnh $50K < threshold $500K → miss
- Layer 2 (60s rolling): tổng 10 lệnh = $500K → TRIGGER ✅

### 1.8. Tổng Quan Pipeline Hoàn Chỉnh (Sau Aggregation)

```
WebSocket WsTrade stream
    │
    ▼
[Layer 0] TradeAggregatorService
    │   Mỗi fill → accumulate vào bucket (key = address + coin + side)
    │   Sliding window 500ms, max 3s
    │   Khi window đóng → emit AggregatedOrder
    │
    ▼
[Layer 1] Threshold Check (per AggregatedOrder)
    │   totalNotional ≥ coin threshold?
    │     ├── YES → Queue phân tích address
    │     └── NO ─┐
    │              ▼
    │   [Layer 2] RollingWindowTracker (60s)
    │     Tổng notional 60s ≥ threshold?
    │       ├── YES → Queue phân tích address
    │       └── NO → Bỏ qua
    │
    ▼
[Analysis] Phân tích Address
    │
    ├── [Step 1] Fetch userNonFundingLedgerUpdates (không cần startTime)
    │   POST /info { "type": "userNonFundingLedgerUpdates", "user": "0x..." }
    │   → Trả về records gần nhất (deposits, withdrawals, transfers...)
    │
    ├── [Step 2] Phân loại wallet type
    │   Chỉ có deposits? → DEPOSIT_ONLY_WALLET ⚠️
    │   Có deposits + withdrawals + trades? → ACTIVE_WALLET
    │   Có internal transfers từ master? → SUB_ACCOUNT
    │
    ├── [Step 3] Tính deposit-to-trade gap
    │   last_deposit_time = thời điểm deposit gần nhất
    │   first_trade_time = thời điểm trade đang phân tích
    │   gap = first_trade_time - last_deposit_time
    │   gap < 1h? → IMMEDIATE_TRADE ⚠️⚠️
    │   gap < 6h? → FAST_TRADE ⚠️
    │
    ├── [Step 4] Fetch clearinghouseState
    │   Xem position size vs account value
    │   position_ratio = total_notional / account_value
    │   position_ratio > 80%? → ALL_IN ⚠️⚠️
    │
    ├── [Step 5] Fetch userFills (hoặc userFillsByTime)
    │   Đây là trade đầu tiên bao giờ? → FIRST_TRADE_EVER ⚠️⚠️⚠️
    │   Chỉ có 1-3 trades? → VERY_FEW_TRADES ⚠️⚠️
    │
    └── [Step 6] Composite scoring → Alert nếu vượt threshold
```

---

## 2. Dynamic Size Threshold Theo Coin

### 2.1. Tầng phân loại

Mỗi phút (hoặc cache 60s), fetch `metaAndAssetCtxs` để lấy `dayNtlVlm` (24h volume) và `openInterest` cho tất cả coins.

```typescript
interface CoinTier {
  coin: string;
  tier: 'BLUECHIP' | 'MID_CAP' | 'LOW_CAP' | 'MICRO_CAP';
  dayNtlVlm: number;       // 24h notional volume (USD)
  openInterest: number;     // current OI (USD)
  notionalThreshold: number; // minimum notional để trigger alert
  leveragedThreshold: number; // minimum notional SAU leverage
}
```

### 2.2. Bảng Threshold

```typescript
function calculateThreshold(dayNtlVlm: number, openInterest: number): CoinTier {
  const oiUsd = openInterest * markPx; // OI in USD

  // BLUECHIP: BTC, ETH, SOL hoặc dayNtlVlm > $100M
  if (dayNtlVlm > 100_000_000) {
    return {
      tier: 'BLUECHIP',
      notionalThreshold: 500_000,  // $500K notional (sau leverage)
      // Ví dụ: $50K margin × 10x = $500K notional
    };
  }

  // MID_CAP: dayNtlVlm $10M - $100M
  if (dayNtlVlm > 10_000_000) {
    return {
      tier: 'MID_CAP',
      notionalThreshold: 100_000,  // $100K notional
    };
  }

  // LOW_CAP: dayNtlVlm $500K - $10M
  if (dayNtlVlm > 500_000) {
    return {
      tier: 'LOW_CAP',
      notionalThreshold: 30_000,   // $30K notional
    };
  }

  // MICRO_CAP: dayNtlVlm < $500K
  return {
    tier: 'MICRO_CAP',
    notionalThreshold: 10_000,     // $10K notional
    // Volume gần 0 mà ai đó trade $10K+ là cực kỳ khả nghi
  };
}
```

### 2.3. Bảng Tham Khảo Thực Tế

| Tier | Ví dụ coins | 24h Volume | OI | Threshold (notional) | Giải thích |
|------|-------------|-----------|-----|---------------------|------------|
| BLUECHIP | BTC, ETH, SOL | >$100M | >$500M | ≥$500K | Whale thường xuyên trade size này, cần kèm thêm signals khác |
| MID_CAP | DOGE, ARB, AVAX, LINK, SUI | $10M-$100M | $50M-$500M | ≥$100K | Size đáng chú ý nhưng vẫn có thể là trader lớn bình thường |
| LOW_CAP | WIF, PEPE, TIA, SEI, JTO | $500K-$10M | $5M-$50M | ≥$30K | Trade >$30K trên coin volume vài triệu = đáng nghi |
| MICRO_CAP | Coins mới, HIP-1/HIP-2 tokens | <$500K | <$5M | ≥$10K | Gần như không ai trade mà đột ngột có $10K+ = rất khả nghi |

### 2.4. Dynamic Threshold bổ sung: % of OI

Ngoài threshold cố định, thêm check **trade size so với OI hiện tại**:

```typescript
// Nếu 1 trade chiếm > 5% open interest hiện tại → flag
const tradeNotional = parseFloat(trade.px) * parseFloat(trade.sz);
const oiRatio = tradeNotional / (openInterest * markPx);

if (oiRatio > 0.05) {
  // Trade chiếm >5% toàn bộ OI → cực kỳ đáng nghi cho bất kỳ coin nào
  flags.push('TRADE_SIZE_GT_5PCT_OI');
}

if (oiRatio > 0.01) {
  // Trade chiếm >1% OI → đáng theo dõi
  flags.push('TRADE_SIZE_GT_1PCT_OI');
}
```

### 2.5. Dynamic Threshold: so với volume gần đây

```typescript
// Nếu trade size > 10% volume của 1 giờ gần nhất → flag
// Cần track hourly volume từ trades stream hoặc candle 1h

const hourlyVolume = getHourlyVolume(trade.coin); // track từ WsTrade
const volumeRatio = tradeNotional / hourlyVolume;

if (volumeRatio > 0.5 && hourlyVolume < 100_000) {
  // Trade chiếm >50% hourly volume VÀ volume thấp
  // = Gần như chỉ mình trader này trade coin này
  flags.push('DOMINATES_HOURLY_VOLUME');
}
```

---

## 3. Wallet History Analysis (Chi tiết)

### 3.1. Fetch và Parse Ledger

```typescript
// API call — KHÔNG cần truyền startTime (docs ghi required nhưng thực tế optional)
// Khi không truyền startTime → trả về records gần nhất
const ledger = await hlApi.post('/info', {
  type: 'userNonFundingLedgerUpdates',
  user: address,
  // KHÔNG truyền startTime, endTime → lấy records gần nhất
});

// Nếu CẦN lấy thêm history cũ hơn, MỚI truyền startTime:
// const olderLedger = await hlApi.post('/info', {
//   type: 'userNonFundingLedgerUpdates',
//   user: address,
//   startTime: 0,  // từ đầu
// });

// Response format:
// [
//   { time: 1731999196516, hash: "0x...", delta: { type: "deposit", usdc: "2703997.45" } },
//   { time: 1732834706761, hash: "0x...", delta: { type: "accountClassTransfer", usdc: "12.0", toPerp: false } },
//   { time: 1732834825313, hash: "0x...", delta: { type: "withdraw", usdc: "500000", nonce: 1, fee: 1 } },
// ]
```

### 3.2. Phân loại Wallet dựa trên Ledger

```typescript
interface WalletProfile {
  address: string;

  // Ledger stats
  totalDeposits: number;         // tổng $ đã deposit
  totalWithdrawals: number;      // tổng $ đã withdraw
  depositCount: number;          // số lần deposit
  withdrawalCount: number;       // số lần withdraw
  transferInCount: number;       // nhận internal transfer
  transferOutCount: number;      // gửi internal transfer
  
  // Timing
  firstActivityTime: number;     // epoch ms - lần đầu tiên có hoạt động
  lastDepositTime: number;       // epoch ms - deposit gần nhất
  walletAgeMs: number;           // khoảng thời gian từ activity đầu tiên
  
  // Derived
  ledgerTypes: Set<string>;      // tập hợp các loại: deposit, withdraw, transfer, etc
  isDepositOnly: boolean;        // CHỈ có deposits, không có withdraw/transfer ra
  isFirstTimeTrader: boolean;    // chưa có fills trước đó
  depositToTradeGapMs: number;   // khoảng cách deposit → trade đầu tiên
  
  // Classification
  walletType: WalletType;
}

enum WalletType {
  GHOST       = 'GHOST',        // Chỉ deposit → 1-2 trades → withdraw (hoặc chưa withdraw)
  FRESH       = 'FRESH',        // Deposit gần đây, ít history
  ONE_SHOT    = 'ONE_SHOT',     // 1 deposit → 1 big trade → rút hết
  NORMAL      = 'NORMAL',       // Trade thường xuyên, có deposit + withdraw bình thường
  WHALE       = 'WHALE',        // Account value lớn, trade thường xuyên
  SUB_ACCOUNT = 'SUB_ACCOUNT',  // Nhận funds từ master qua internal transfer
}
```

### 3.3. Logic Phân Loại

```typescript
function classifyWallet(ledger: LedgerEntry[], fills: UserFill[], state: ClearinghouseState): WalletProfile {
  const deposits = ledger.filter(l => l.delta.type === 'deposit');
  const withdrawals = ledger.filter(l => l.delta.type === 'withdraw');
  const internalTransfers = ledger.filter(l => 
    l.delta.type === 'internalTransfer' || l.delta.type === 'subAccountTransfer'
  );

  const totalDeposits = deposits.reduce((sum, d) => sum + parseFloat(d.delta.usdc), 0);
  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + parseFloat(w.delta.usdc), 0);
  
  const firstActivity = Math.min(...ledger.map(l => l.time));
  const walletAgeMs = Date.now() - firstActivity;
  const walletAgeDays = walletAgeMs / (1000 * 60 * 60 * 24);

  const lastDeposit = deposits.length > 0
    ? Math.max(...deposits.map(d => d.time))
    : 0;

  const firstFill = fills.length > 0
    ? Math.min(...fills.map(f => f.time))
    : Date.now();

  const depositToTradeGapMs = lastDeposit > 0 
    ? firstFill - lastDeposit 
    : Infinity;

  // --- Classification logic ---

  const isDepositOnly = withdrawals.length === 0 && internalTransfers.filter(t => 
    t.delta.destination !== address // outgoing transfers
  ).length === 0;

  const isFirstTimeTrader = fills.length <= 3;

  let walletType: WalletType;

  // GHOST: Ví dùng 1 lần, chỉ có deposits, rất ít fills
  if (isDepositOnly && fills.length <= 5 && walletAgeDays < 14) {
    walletType = WalletType.GHOST;
  }
  // ONE_SHOT: 1 deposit → 1 big trade (hoặc đã withdraw rồi)
  else if (deposits.length <= 2 && fills.length <= 3 && walletAgeDays < 7) {
    walletType = WalletType.ONE_SHOT;
  }
  // FRESH: Deposit gần đây, ít history
  else if (walletAgeDays < 30 && fills.length < 20) {
    walletType = WalletType.FRESH;
  }
  // SUB_ACCOUNT: Nhận funds qua internal/sub-account transfer
  else if (internalTransfers.length > 0 && deposits.length === 0) {
    walletType = WalletType.SUB_ACCOUNT;
  }
  // WHALE: Account value lớn
  else if (parseFloat(state.marginSummary.accountValue) > 1_000_000) {
    walletType = WalletType.WHALE;
  }
  else {
    walletType = WalletType.NORMAL;
  }

  return {
    address,
    totalDeposits,
    totalWithdrawals,
    depositCount: deposits.length,
    withdrawalCount: withdrawals.length,
    transferInCount: internalTransfers.length,
    transferOutCount: 0, // count outgoing
    firstActivityTime: firstActivity,
    lastDepositTime: lastDeposit,
    walletAgeMs,
    ledgerTypes: new Set(ledger.map(l => l.delta.type)),
    isDepositOnly,
    isFirstTimeTrader,
    depositToTradeGapMs,
    walletType,
  };
}
```

---

## 4. Scoring Engine (Chi Tiết)

### 4.1. Tổng Quan Score Components

```
TỔNG ĐIỂM TỐI ĐA: 100

├── [A] Deposit-to-Trade Speed     : 0-25 điểm
├── [B] Wallet Freshness           : 0-20 điểm  
├── [C] Trade Size vs Market       : 0-20 điểm
├── [D] Position Concentration     : 0-15 điểm
├── [E] Ledger Purity              : 0-10 điểm
└── [F] Behavioral Multiplier      : ×1.0 - ×1.5
```

### 4.2. [A] Deposit-to-Trade Speed (0-25 điểm)

Khoảng cách giữa deposit gần nhất và trade size lớn.

```typescript
function scoreDepositToTradeSpeed(gapMs: number, depositAmount: number, tradeNotional: number): number {
  // Thêm check: trade dùng bao nhiêu % số tiền vừa deposit?
  const depositUtilization = tradeNotional / depositAmount; // margin, ko phải notional
  
  const gapMinutes = gapMs / (1000 * 60);

  let timeScore: number;
  if (gapMinutes <= 5) {
    timeScore = 25;       // Deposit xong trade ngay trong 5 phút
  } else if (gapMinutes <= 15) {
    timeScore = 22;       // Trong 15 phút
  } else if (gapMinutes <= 30) {
    timeScore = 18;       // Trong 30 phút
  } else if (gapMinutes <= 60) {
    timeScore = 14;       // Trong 1 giờ
  } else if (gapMinutes <= 180) {
    timeScore = 10;       // Trong 3 giờ
  } else if (gapMinutes <= 360) {
    timeScore = 6;        // Trong 6 giờ
  } else if (gapMinutes <= 1440) {
    timeScore = 3;        // Trong 24 giờ
  } else {
    timeScore = 0;        // Hơn 24 giờ → bình thường
  }

  // Bonus nếu dùng gần hết số tiền deposit (all-in mentality)
  if (depositUtilization > 0.8) {
    timeScore = Math.min(25, timeScore + 3);
  }

  return timeScore;
}
```

**Ví dụ thực tế:**
```
12:00:00  Deposit $500,000 USDC
12:03:22  Open 20x LONG BTC ($10M notional)  ← gap = 3 phút → 25 điểm
```

### 4.3. [B] Wallet Freshness (0-20 điểm)

Ví càng mới, càng ít history → càng khả nghi.

```typescript
function scoreWalletFreshness(profile: WalletProfile): number {
  const ageDays = profile.walletAgeMs / (1000 * 60 * 60 * 24);
  const fillCount = profile.fillCount; // total trades ever

  let score = 0;

  // Wallet age scoring
  if (ageDays < 1) {
    score += 10;           // Ví tạo chưa đầy 1 ngày
  } else if (ageDays < 3) {
    score += 8;
  } else if (ageDays < 7) {
    score += 6;
  } else if (ageDays < 14) {
    score += 4;
  } else if (ageDays < 30) {
    score += 2;
  }

  // Trade history scoring (ít trades = khả nghi hơn)
  if (fillCount === 0) {
    score += 10;           // ĐÂY LÀ TRADE ĐẦU TIÊN BAO GIỜ
  } else if (fillCount <= 3) {
    score += 8;
  } else if (fillCount <= 10) {
    score += 5;
  } else if (fillCount <= 30) {
    score += 2;
  }

  return Math.min(20, score);
}
```

**Edge case:** Ví cũ nhưng dormant lâu rồi đột nhiên deposit lớn + trade:
```typescript
// Nếu ví cũ (>30 ngày) nhưng dormant >30 ngày trước deposit này
const lastActivityBeforeDeposit = ledger
  .filter(l => l.time < lastDeposit - 30 * 24 * 3600 * 1000)
  .sort((a, b) => b.time - a.time)[0];

if (!lastActivityBeforeDeposit) {
  // Ví cũ nhưng không hoạt động 30+ ngày trước deposit → tương đương ví mới
  bonusScore += 5;
  flags.push('DORMANT_WALLET_REACTIVATED');
}
```

### 4.4. [C] Trade Size vs Market Context (0-20 điểm)

So sánh trade size với liquidity của coin đó.

```typescript
function scoreTradeSizeVsMarket(
  tradeNotional: number,
  coinCtx: AssetCtx,
  hourlyVolume: number,
  tier: CoinTier
): number {
  const dayVlm = parseFloat(coinCtx.dayNtlVlm);
  const oi = parseFloat(coinCtx.openInterest) * parseFloat(coinCtx.markPx);
  
  let score = 0;

  // --- So với 24h volume ---
  const vlmRatio = tradeNotional / dayVlm;
  
  if (dayVlm < 100_000 && tradeNotional > 10_000) {
    // Volume gần như ZERO mà có trade >$10K
    score += 12;
    flags.push(`TRADE_ON_DEAD_MARKET_vlm=${formatUsd(dayVlm)}`);
  } else if (vlmRatio > 0.1) {
    // Trade > 10% daily volume
    score += 10;
  } else if (vlmRatio > 0.05) {
    score += 7;
  } else if (vlmRatio > 0.01) {
    score += 4;
  }

  // --- So với Open Interest ---
  const oiRatio = tradeNotional / oi;

  if (oiRatio > 0.1) {
    // Trade > 10% toàn bộ OI
    score += 8;
    flags.push(`TRADE_GT_10PCT_OI`);
  } else if (oiRatio > 0.05) {
    score += 6;
  } else if (oiRatio > 0.01) {
    score += 3;
  }

  // --- So với hourly volume ---
  if (hourlyVolume < 50_000 && tradeNotional > 20_000) {
    score += 5;
    flags.push('DOMINATES_HOURLY_VOLUME');
  }

  return Math.min(20, score);
}
```

**Ví dụ minh hoạ:**
```
Coin: RANDOMCOIN
24h Volume: $45,000
Open Interest: $120,000
Hourly Volume (last 1h): $2,000

Trader deposit $50K, open LONG $35K notional (5x leverage, $7K margin):
  vlmRatio = 35000 / 45000 = 77.8%  → 10 điểm
  oiRatio  = 35000 / 120000 = 29.2% → 8 điểm
  hourly   = 35000 > 50000? No, but 35000 vs 2000 hourly → 5 điểm
  TOTAL: 20/20 (capped)
  FLAGS: TRADE_ON_DEAD_MARKET, TRADE_GT_10PCT_OI, DOMINATES_HOURLY_VOLUME
```

### 4.5. [D] Position Concentration (0-15 điểm)

Trader dùng bao nhiêu % account cho trade này?

```typescript
function scorePositionConcentration(
  state: ClearinghouseState,
  tradeNotional: number,
  depositAmount: number
): number {
  const accountValue = parseFloat(state.marginSummary.accountValue);
  const marginUsed = parseFloat(state.marginSummary.totalMarginUsed);

  // % account value đang dùng cho margin
  const marginUtilization = marginUsed / accountValue;
  
  // % deposit amount được dùng cho trade này
  const depositUtilization = marginUsed / depositAmount;
  
  // Implied leverage
  const impliedLeverage = tradeNotional / accountValue;

  let score = 0;

  // Dùng gần hết account cho positions
  if (marginUtilization > 0.9) {
    score += 8;            // All-in, dùng >90% account
    flags.push('ALL_IN_POSITION');
  } else if (marginUtilization > 0.7) {
    score += 5;
  } else if (marginUtilization > 0.5) {
    score += 3;
  }

  // Dùng gần hết deposit cho trade luôn
  if (depositUtilization > 0.9) {
    score += 4;
    flags.push('USED_90PCT_OF_DEPOSIT');
  }

  // Leverage cực cao
  if (impliedLeverage >= 20) {
    score += 3;
    flags.push(`HIGH_LEVERAGE_${impliedLeverage}x`);
  }

  return Math.min(15, score);
}
```

### 4.6. [E] Ledger Purity (0-10 điểm)

Lịch sử ledger "sạch" bất thường = khả nghi.

```typescript
function scoreLedgerPurity(profile: WalletProfile): number {
  let score = 0;

  // Chỉ có deposits, không có gì khác
  if (profile.isDepositOnly) {
    score += 5;
    flags.push('DEPOSIT_ONLY_WALLET');
  }

  // Chỉ có 1 loại ledger entry (deposit)
  if (profile.ledgerTypes.size === 1 && profile.ledgerTypes.has('deposit')) {
    score += 3;
    flags.push('SINGLE_LEDGER_TYPE');
  }

  // Chưa bao giờ claim rewards, stake, v.v. (= ví dùng 1 lần)
  const hasRewardsClaim = profile.ledgerTypes.has('rewardsClaim');
  const hasVaultActivity = profile.ledgerTypes.has('vaultDeposit') || 
                           profile.ledgerTypes.has('vaultCreate');
  
  if (!hasRewardsClaim && !hasVaultActivity && profile.walletAgeMs < 30 * 24 * 3600 * 1000) {
    score += 2;
    flags.push('NO_PLATFORM_ENGAGEMENT');
  }

  return Math.min(10, score);
}
```

### 4.7. [F] Behavioral Multiplier (×1.0 - ×1.5)

Nhân hệ số dựa trên tổ hợp signals.

```typescript
function calculateMultiplier(flags: string[]): number {
  let multiplier = 1.0;

  // Deposit → Trade trong 5 phút + Ví mới + All-in = cực kỳ khả nghi
  const hasImmediateTrade = flags.some(f => f.includes('gap_lt_5min'));
  const hasFreshWallet = flags.some(f => f.includes('FIRST_TRADE_EVER') || f.includes('wallet_age_lt_1d'));
  const hasAllIn = flags.includes('ALL_IN_POSITION');
  const hasDeadMarket = flags.some(f => f.includes('DEAD_MARKET'));

  if (hasImmediateTrade && hasFreshWallet) multiplier += 0.2;
  if (hasImmediateTrade && hasAllIn) multiplier += 0.15;
  if (hasFreshWallet && hasDeadMarket) multiplier += 0.15;
  if (hasImmediateTrade && hasFreshWallet && hasAllIn) multiplier += 0.1; // triple combo bonus

  return Math.min(1.5, multiplier);
}
```

### 4.8. Final Score

```typescript
function calculateFinalScore(components: ScoreComponents): InsiderAlert {
  const rawScore = 
    components.depositToTradeSpeed +    // 0-25
    components.walletFreshness +         // 0-20
    components.tradeSizeVsMarket +       // 0-20
    components.positionConcentration +   // 0-15
    components.ledgerPurity;             // 0-10
    // Max raw = 90

  const multiplier = calculateMultiplier(components.flags);
  const finalScore = Math.min(100, Math.round(rawScore * multiplier));

  let alertLevel: AlertLevel;
  if (finalScore >= 75) alertLevel = 'CRITICAL';      // 🔴
  else if (finalScore >= 55) alertLevel = 'HIGH';      // 🟠
  else if (finalScore >= 40) alertLevel = 'MEDIUM';    // 🟡
  else if (finalScore >= 25) alertLevel = 'LOW';       // 🔵
  else alertLevel = 'NONE';                            // ⚪ Không alert

  return { finalScore, alertLevel, components, flags: components.flags };
}
```

---

## 5. Ví Dụ Thực Tế Scoring

### 5.1. Case: Insider chuẩn (BTC Bluechip)

```
Trader: 0xABC...
Timeline:
  14:00:00  Deposit $2,000,000 USDC (first ever activity)
  14:02:15  Open SHORT BTC $40,000,000 notional (20x leverage)

Coin: BTC (BLUECHIP, dayNtlVlm = $500M, OI = $2B)

Scoring:
  [A] Deposit-to-Trade Speed: gap = 2m15s → 25/25
  [B] Wallet Freshness: age < 1 day (10) + first trade ever (10) → 20/20
  [C] Trade Size vs Market: $40M / $500M vlm = 8% (4) + $40M / $2B OI = 2% (3) → 7/20
  [D] Position Concentration: margin $2M / account $2M = 100% → ALL_IN → 12/15
  [E] Ledger Purity: deposit_only + single_type → 8/10

  Raw = 25 + 20 + 7 + 12 + 8 = 72
  Multiplier: immediate_trade + fresh_wallet + all_in = ×1.45
  Final = min(100, 72 × 1.45) = 100 🔴 CRITICAL
```

### 5.2. Case: Insider altcoin (Volume thấp)

```
Trader: 0xDEF...
Timeline:
  09:00:00  Deposit $15,000 USDC (first ever)
  09:08:30  Open LONG RANDOMALT $75,000 notional (5x leverage)

Coin: RANDOMALT (MICRO_CAP, dayNtlVlm = $23,000, OI = $80,000)

Scoring:
  [A] Deposit-to-Trade: gap = 8m30s → 22/25
  [B] Wallet Freshness: age < 1 day (10) + first trade (10) → 20/20
  [C] Trade Size vs Market: 
      $75K / $23K vlm = 326% → DEAD_MARKET → 12/12
      $75K / $80K OI = 93.8% → 8/8
      → 20/20 (capped)
  [D] Position Concentration: $15K margin / $15K account = 100% → 12/15
  [E] Ledger Purity: deposit_only → 8/10

  Raw = 22 + 20 + 20 + 12 + 8 = 82
  Multiplier: immediate + fresh + dead_market = ×1.35
  Final = min(100, 82 × 1.35) = 100 🔴 CRITICAL
```

### 5.3. Case: Trader bình thường (False Positive thấp)

```
Trader: 0x789...
Timeline:
  30 ngày trước: nhiều deposits ($5K, $10K, $3K...)
  30 ngày trước → nay: 150+ trades trên BTC, ETH, SOL
  Hôm nay 10:00: Deposit thêm $50,000
  Hôm nay 16:00: Open LONG ETH $200K notional (4x)

Scoring:
  [A] Deposit-to-Trade: gap = 6 giờ → 6/25
  [B] Wallet Freshness: age = 30 days (0) + 150 fills (0) → 0/20
  [C] Trade Size vs Market: $200K / $300M vlm = 0.07% → 0/20
  [D] Position Concentration: margin $50K / account $200K = 25% → 0/15
  [E] Ledger Purity: has deposits + withdrawals + rewards → 0/10

  Raw = 6 + 0 + 0 + 0 + 0 = 6
  Multiplier: ×1.0
  Final = 6 ⚪ NONE (không alert)
```

---

## 6. Implementation Architecture

### 6.1. NestJS Service Structure

```
src/analyzer/strategies/
├── fresh-deposit-trade.strategy.ts    ← STRATEGY CHÍNH
├── services/
│   ├── trade-aggregator.service.ts    ← Gộp WsTrade fills thành AggregatedOrder
│   ├── rolling-window.service.ts      ← Track tổng notional 60s (anti-split)
│   ├── threshold.service.ts           ← Quản lý dynamic thresholds per coin
│   ├── wallet-profiler.service.ts     ← Phân tích wallet history
│   ├── volume-tracker.service.ts      ← Track hourly volume từ WS stream
│   └── market-context.service.ts      ← Cache metaAndAssetCtxs
└── interfaces/
    ├── aggregated-order.interface.ts   ← AggregatedOrder, AggKey types
    ├── coin-tier.interface.ts
    ├── wallet-profile.interface.ts
    └── alert-result.interface.ts
```

### 6.2. ThresholdService - Auto-update thresholds

```typescript
@Injectable()
export class ThresholdService {
  private coinTiers: Map<string, CoinTier> = new Map();

  constructor(
    private hlApi: HlApiService,
    private configService: ConfigService,
  ) {}

  // Gọi mỗi 60 giây
  @Cron('*/60 * * * * *')
  async updateThresholds(): Promise<void> {
    const [meta, assetCtxs] = await this.hlApi.getMetaAndAssetCtxs();
    
    for (let i = 0; i < meta.universe.length; i++) {
      const coin = meta.universe[i].name;
      const ctx = assetCtxs[i];
      const dayNtlVlm = parseFloat(ctx.dayNtlVlm);
      const oi = parseFloat(ctx.openInterest);
      const markPx = parseFloat(ctx.markPx);
      
      this.coinTiers.set(coin, this.calculateTier(coin, dayNtlVlm, oi, markPx));
    }
  }

  getCoinTier(coin: string): CoinTier | undefined {
    return this.coinTiers.get(coin);
  }

  shouldAlert(coin: string, notionalValue: number): boolean {
    const tier = this.coinTiers.get(coin);
    if (!tier) return notionalValue > 50_000; // fallback
    return notionalValue >= tier.notionalThreshold;
  }

  private calculateTier(coin: string, dayNtlVlm: number, oi: number, markPx: number): CoinTier {
    // Hardcode bluechips ngoài logic volume
    const BLUECHIPS = ['BTC', 'ETH', 'SOL'];
    if (BLUECHIPS.includes(coin) || dayNtlVlm > 100_000_000) {
      return { coin, tier: 'BLUECHIP', dayNtlVlm, openInterest: oi, notionalThreshold: 500_000 };
    }
    if (dayNtlVlm > 10_000_000) {
      return { coin, tier: 'MID_CAP', dayNtlVlm, openInterest: oi, notionalThreshold: 100_000 };
    }
    if (dayNtlVlm > 500_000) {
      return { coin, tier: 'LOW_CAP', dayNtlVlm, openInterest: oi, notionalThreshold: 30_000 };
    }
    return { coin, tier: 'MICRO_CAP', dayNtlVlm, openInterest: oi, notionalThreshold: 10_000 };
  }
}
```

### 6.3. VolumeTracker - Track hourly volume realtime

```typescript
@Injectable()
export class VolumeTrackerService implements OnModuleInit {
  // coin → sliding window of trade volumes
  private hourlyVolumes: Map<string, { time: number; volume: number }[]> = new Map();

  /**
   * Gọi mỗi khi nhận RAW WsTrade (TRƯỚC aggregation).
   * Volume tracker cần từng fill riêng lẻ để tính chính xác hourly volume.
   * (Không dùng AggregatedOrder vì cần real-time, không chờ window đóng)
   */
  recordTrade(trade: WsTrade): void {
    const notional = parseFloat(trade.px) * parseFloat(trade.sz);
    const coin = trade.coin;
    
    if (!this.hourlyVolumes.has(coin)) {
      this.hourlyVolumes.set(coin, []);
    }
    
    const window = this.hourlyVolumes.get(coin)!;
    window.push({ time: trade.time, volume: notional });
    
    // Cleanup: giữ lại 1 giờ gần nhất
    const oneHourAgo = Date.now() - 3600 * 1000;
    const filtered = window.filter(w => w.time > oneHourAgo);
    this.hourlyVolumes.set(coin, filtered);
  }

  getHourlyVolume(coin: string): number {
    const window = this.hourlyVolumes.get(coin);
    if (!window || window.length === 0) return 0;
    return window.reduce((sum, w) => sum + w.volume, 0);
  }
}
```

### 6.4. Core Strategy Service

```typescript
@Injectable()
export class FreshDepositTradeStrategy {
  constructor(
    private hlApi: HlApiService,
    private thresholdService: ThresholdService,
    private volumeTracker: VolumeTrackerService,
    private alertService: AlertService,
    private cacheManager: CacheService,
  ) {}

  /**
   * Gọi từ TradeAggregatorService khi AggregatedOrder vượt threshold.
   * Input đã là tổng notional SAU KHI gộp fills.
   *
   * @param order - AggregatedOrder đã gộp từ nhiều WsTrade fills
   */
  async analyze(order: AggregatedOrder): Promise<void> {
    const { traderAddress, coin, totalNotional, direction, fillCount, avgPx } = order;

    // Skip nếu đã analyze gần đây
    const cached = await this.cacheManager.get(`analyzed:${traderAddress}`);
    if (cached) return;

    await this.analyzeAddress(traderAddress, order);
    
    // Cache 5 phút
    await this.cacheManager.set(`analyzed:${traderAddress}`, '1', 300);
  }

  private async analyzeAddress(
    address: string,
    order: AggregatedOrder,
  ): Promise<void> {
    try {
      // Fetch tất cả data cần thiết song song
      const [ledger, fills, state, coinTier] = await Promise.all([
        // KHÔNG truyền startTime → lấy records gần nhất
        this.hlApi.getUserNonFundingLedger(address),
        this.hlApi.getUserFills(address),
        this.hlApi.getClearinghouseState(address),
        Promise.resolve(this.thresholdService.getCoinTier(order.coin)),
      ]);

      // Nếu không có ledger → skip (ví dùng internal transfer, khó phân tích)
      if (!ledger || ledger.length === 0) return;

      // Bước 1: Profile wallet
      const profile = classifyWallet(ledger, fills, state);

      // Bước 2: Tính các scores
      const depositAmount = profile.totalDeposits;
      const lastDepositTime = profile.lastDepositTime;
      const gapMs = order.firstFillTime - lastDepositTime;

      const coinCtx = coinTier; // from threshold service
      const hourlyVlm = this.volumeTracker.getHourlyVolume(order.coin);

      const flags: string[] = [];

      // Dùng order.totalNotional (đã gộp) thay vì single fill notional
      const depositToTradeScore = scoreDepositToTradeSpeed(gapMs, depositAmount, order.totalNotional);
      const walletFreshnessScore = scoreWalletFreshness(profile);
      const tradeSizeScore = scoreTradeSizeVsMarket(order.totalNotional, coinCtx, hourlyVlm);
      const concentrationScore = scorePositionConcentration(state, order.totalNotional, depositAmount);
      const ledgerPurityScore = scoreLedgerPurity(profile);

      // Thêm flag nếu lệnh match với nhiều makers (dấu hiệu market order lớn)
      if (order.fillCount >= 5) {
        flags.push(`LARGE_MARKET_ORDER_${order.fillCount}_FILLS`);
      }
      if (order.counterparties.length >= 5) {
        flags.push(`MATCHED_${order.counterparties.length}_COUNTERPARTIES`);
      }

      // Bước 3: Final score
      const result = calculateFinalScore({
        depositToTradeSpeed: depositToTradeScore,
        walletFreshness: walletFreshnessScore,
        tradeSizeVsMarket: tradeSizeScore,
        positionConcentration: concentrationScore,
        ledgerPurity: ledgerPurityScore,
        flags,
      });

      // Bước 4: Alert nếu cần
      if (result.alertLevel !== 'NONE') {
        await this.alertService.sendAlert({
          address,
          score: result.finalScore,
          alertLevel: result.alertLevel,
          coin: order.coin,
          side: order.direction,                  // 'LONG' | 'SHORT'
          tradeNotional: order.totalNotional,      // TỔNG sau gộp
          tradeSz: order.totalSz,                  // TỔNG size
          avgPx: order.avgPx,                      // VWAP
          fillCount: order.fillCount,              // Số fills gộp
          counterpartyCount: order.counterparties.length,
          depositAmount,
          depositToTradeGap: gapMs,
          walletType: profile.walletType,
          walletAgeDays: profile.walletAgeMs / (1000 * 60 * 60 * 24),
          totalFills: fills.length,
          accountValue: parseFloat(state.marginSummary.accountValue),
          components: result.components,
          flags: result.flags,
        });
      }
    } catch (error) {
      // Log error nhưng không crash
      console.error(`Failed to analyze ${address}:`, error.message);
    }
  }
}
```

---

## 7. Alert Message Template

### Telegram Format

```
🔴 FRESH DEPOSIT INSIDER ALERT (Score: 92/100)

👤 Address: 0xABC...DEF
🔗 https://app.hyperliquid.xyz/explorer/address/0xABC...DEF

━━━ TRADE INFO ━━━
📊 Coin: BTC (BLUECHIP)
📍 Side: SHORT
💰 Total Size: $40,000,000 notional (20x leverage)
📏 Base Size: 421.05 BTC @ $95,003 VWAP
🧩 Fills: 12 fills matched with 12 counterparties
💵 Deposit: $2,000,000 USDC
⏱ Deposit → Trade: 2 minutes 15 seconds

━━━ WALLET PROFILE ━━━
🏷 Type: GHOST (one-time wallet)
📅 Age: 0.002 days (3 minutes)
📋 Total Fills: 0 (FIRST TRADE EVER)
💳 Ledger: deposit only
🔑 Account Value: $2,000,000

━━━ MARKET CONTEXT ━━━
📈 BTC 24h Volume: $500,000,000
📊 BTC Open Interest: $2,000,000,000
📏 Trade = 8% of daily volume
📏 Trade = 2% of OI

━━━ SCORE BREAKDOWN ━━━
⏱ Deposit Speed:   25/25 █████████████████████████
🆕 Wallet Fresh:    20/20 ████████████████████
📏 Size vs Market:   7/20 ███████░░░░░░░░░░░░░
🎯 Concentration:   12/15 ████████████████░░░
📋 Ledger Purity:    8/10 ████████████████░░
🔄 Multiplier:       ×1.45

━━━ FLAGS ━━━
🚩 DEPOSIT_TO_TRADE_LT_5MIN
🚩 FIRST_TRADE_EVER
🚩 WALLET_AGE_LT_1_DAY
🚩 ALL_IN_POSITION
🚩 DEPOSIT_ONLY_WALLET
🚩 HIGH_LEVERAGE_20x
🚩 LARGE_MARKET_ORDER_12_FILLS
🚩 MATCHED_12_COUNTERPARTIES

⏰ 2026-02-27 14:02:15 UTC
```

### Compact Alert (cho HIGH nhưng không CRITICAL)

```
🟠 FRESH DEPOSIT ALERT (56/100)

0xDEF...GHI | LONG RANDOMALT $75K (5x)
Deposit $15K → Trade in 8m30s
Wallet: GHOST, 0 fills, 0.006 days old
Market: $23K 24h vol, $80K OI
Trade = 326% daily vol ⚠️

🔗 app.hyperliquid.xyz/explorer/address/0xDEF...GHI
```

---

## 8. Exclude List (Giảm False Positive)

```typescript
// Danh sách loại trừ - không analyze các address này
const EXCLUDE_PATTERNS = {
  // Hyperliquid system addresses
  vaults: ['0xdfc24b077bc1425ad1dea75bcb6f8158e10df303'], // HLP vault
  
  // Cách detect market maker (không phải insider):
  // - Trade frequency > 100 trades/ngày
  // - Luôn có cả buy + sell (two-sided)
  // - Spread-capture pattern (mua bid bán ask)
  isMarketMaker: (fills: UserFill[]) => {
    if (fills.length < 100) return false;
    const buys = fills.filter(f => f.side === 'B').length;
    const sells = fills.filter(f => f.side === 'A').length;
    const ratio = Math.min(buys, sells) / Math.max(buys, sells);
    return ratio > 0.4; // Gần balanced buy/sell = likely MM
  },
  
  // Cách detect copy-trader (không phải insider):
  // - Trade timing closely follows known whale
  // - Size nhỏ hơn nhiều
  // - Cùng coin, cùng direction, delay 1-30 giây
  
  // Accounts quá nhỏ (noise)
  minAccountValue: 1_000, // Bỏ qua account < $1,000
};
```

---

## 9. Tổng Kết

### Core Insight

Strategy này focus vào **1 câu hỏi đơn giản nhưng cực kỳ powerful:**

> "Trader này vừa nạp tiền và mở lệnh lớn ngay lập tức — tại sao họ tự tin như vậy?"

### Điểm mạnh
- Detect được ngay lập tức (realtime từ WebSocket)
- Ít false positive vì kết hợp nhiều signals (timing + wallet age + size + market context)
- Dynamic thresholds tự điều chỉnh theo liquidity từng coin
- Không cần data lịch sử dài để phân tích (chỉ cần ledger + current state)

### Điểm yếu cần bổ sung
- Insider dùng ví cũ có history → cần kết hợp với strategies khác
- Sub-accounts nhận funds từ master → khó detect nếu master là ví cũ
- Copy traders cũng deposit nhanh + trade nhanh → cần filter
- Market makers lớn deposit + trade lớn liên tục → cần whitelist

### Kết hợp với strategies khác
Khi strategy này flag 1 address, nên chạy thêm:
1. **Timing Analysis** — Trade này có đúng trước event không?
2. **Win Rate** — Address này có history win rate cao không?
3. **Wallet Cluster** — Deposit source có liên quan đến project nào không?

---

## 10. Trạng Thái Implementation Hiện Tại (v2.1 — 2026-03-03)

### 10.1. Đã Implement ✅

| Tính năng | Trạng thái | File | Ghi chú |
|-----------|-----------|------|---------|
| Sliding window 500ms + MAX 3s | ✅ Done | `insider-detector.service.ts` | |
| Both-side tracking (users[0] + users[1]) | ✅ Done | `insider-detector.service.ts` | Tránh miss SELL taker |
| Dynamic coin tier thresholds | ✅ Done | `insider-detector.service.ts` | Refresh mỗi 60s từ metaAndAssetCtxs |
| `userNonFundingLedgerUpdates` | ✅ Done | `hyperliquid-info.service.ts` | |
| Composite scoring A+B+C+D+E × F | ✅ Done | `insider-detector.service.ts` | |
| AlertLevel enum (CRITICAL/HIGH/MEDIUM/LOW/NONE) | ✅ Done | `trade.dto.ts` | |
| WalletType enum (GHOST/ONE_SHOT/FRESH/WHALE/NORMAL) | ✅ Done | `trade.dto.ts` | |
| InsiderFlag mở rộng | ✅ Done | `trade.dto.ts` | FRESH_DEP, DEP_ONLY, GHOST, ONE_SHOT, ALL_IN, HIGH_LEV, DEAD_MKT, HIGH_OI |
| Rate limiter sequential queue | ✅ Done | `rate-limiter.service.ts` | 1100ms giữa các REST calls |
| Web UI dashboard + pagination | ✅ Done | `web/app.controller.ts` | Port 3235, poll 2s, 20 rows/trang |
| Web UI filter/search | ✅ Done | `web/app.controller.ts` | Filter coin, address, flag, alertLevel... |
| Lark webhook alert | ✅ Done | `lark-alert.service.ts` | Card màu theo alertLevel |
| **Layer 0: Zero address skip** | ✅ Done | `insider-detector.service.ts` | Bỏ `0x000...000` trước aggregation |
| **Layer 1: MM/HFT filter (Copin API)** | ✅ Done | `insider-detector.service.ts` | `userAddRate <= 0` → skip inspection |
| `getUserFees()` Copin API | ✅ Done | `hyperliquid-info.service.ts` | POST `https://hyper.copin.io/info` |
| HFT cache 24h | ✅ Done | `insider-detector.service.ts` | Tránh gọi Copin API lặp lại |
| InsiderFlag.HFT_PATTERN | ✅ Done | `trade.dto.ts` | Badge `🤖HFT` gray trên web UI |

### 10.2. Bug Quan Trọng Đã Fix

**Bug: `trade.time` vs `trade.detectedAt` trong tính deposit-to-trade gap**

Vấn đề gốc: Hyperliquid WS `trades` channel **replay historical fills** khi mới connect.
Các fills replay có `time` = timestamp fill gốc (vài tháng trước), nhưng `detectedAt` = thời điểm scanner phát hiện (≈ now).

```
// ❌ SAI — dùng fill timestamp (có thể là tháng 11/2025 do WS replay)
const gapMs = trade.time - lastDepositTime;
// Với fill.time = Nov 2025, deposit.time = Mar 2026 → gapMs = -563 days
// → gapMin ≤ 5 là TRUE với số âm → scoreA = 25 → False Positive

// ✅ ĐÚNG — dùng detection time (≈ now)
const gapMs = trade.detectedAt - lastDepositTime;
// Với detectedAt = Mar 2026, deposit.time = tháng cũ → gapMs lớn dương → scoreA = 0
```

Ảnh hưởng: Trước khi fix, gần như **mọi trade** đều bị đánh FRESH_DEP và scoreA = 25 → nhiều false positive suspects.

### 10.3. Những gì cần làm tiếp (Backlog)

- [ ] Layer 2: REST pre-check fill balance ratio (catch algo traders lọt qua Copin API)
- [ ] Rolling window 60s Layer 2 (detect TWAP split orders)
- [ ] Hourly volume tracker (scoreC hiện chỉ dùng 24h volume từ API, chưa có realtime hourly)
- [ ] Dormant wallet bonus (`DORMANT_WALLET_REACTIVATED` flag)
- [ ] Persist suspects vào Redis giữa các lần restart

---

## 11. MM/HFT Filter Implementation

### 11.1. Vấn Đề

Quan sát từ logs thực tế:

```
[11:46:13] BTC BUY $1.33M (103 fills) @ $66,631 by 0x267a8c44...  ← lần 1
[11:46:13] BTC BUY $1.33M  (57 fills) @ $66,609 by 0x267a8c44...  ← lần 2
[11:48:13] BTC SELL $1.33M (103 fills) @ $66,631 by 0x267a8c44...  ← lần 3
[11:48:15] BTC SELL $1.33M  (57 fills) @ $66,609 by 0x267a8c44...  ← lần 4
```

- Cùng 1 địa chỉ lặp lại với size gần giống nhau, cả BUY lẫn SELL → **HFT/Market Maker**
- `0x0000...0000` (zero address) → **liquidation engine** của Hyperliquid
- **Noise chiếm ~60–70% large trades** → tốn rate limit budget vô ích, làm loãng signal thật

### 11.2. Phân Loại Noise Sources

| Loại | Dấu hiệu | Cách xử lý | Trạng thái |
|------|----------|-----------|-----------|
| Zero address | `0x000...000` | Hard-skip trong `bufferTrade()` | ✅ Done |
| Market Maker / HFT | `userAddRate <= 0` qua Copin API | Skip inspection, flag `HFT` | ✅ Done |
| Algo trader (high fills) | >3000 fills/90d | REST pre-check trong `inspectTrader()` | ⬜ Backlog |
| Known protocol vaults | Static whitelist (HLP vault...) | Hard-skip | ⬜ Backlog |
| Whale bình thường (non-fresh) | Nhiều fills, ví lâu năm | Scoring tự lọc (scoreB = 0) | ✅ Auto |

### 11.3. Layer 0: Zero Address Hard Filter ✅

Áp dụng ngay trong `bufferTrade()` trước khi vào aggregation buffer — **không tốn timer/memory**.

```typescript
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isZero = (addr: string) => !addr || addr === ZERO_ADDRESS;

if (!isZero(buyerAddr))  this.accumulateFill(buyerAddr,  'B', raw);
if (!isZero(sellerAddr)) this.accumulateFill(sellerAddr, 'A', raw);
```

### 11.4. Layer 1: Copin API Fee Tier Check ✅

**Nguyên tắc:** Hyperliquid chia trader theo fee tier. Market maker ở tier cao nhất được hưởng **maker rebate** — tức `userAddRate` âm (nhận tiền khi post liquidity). Đây là cách chính xác nhất để phân biệt MM.

**API:** `POST https://hyper.copin.io/info` với body `{"type":"userFees","user":"<address>"}`

```json
// Response mẫu — trader bình thường:
{ "userCrossRate": "0.0003", "userAddRate": "0.00004", ... }

// Response mẫu — market maker (maker rebate tier):
{ "userCrossRate": "0.0002", "userAddRate": "-0.00002", ... }
```

**Điều kiện lọc:** `parseFloat(userAddRate) <= 0` → MM/HFT → skip inspection.

**Implementation trong `inspectTrader()`:**

```typescript
// Layer 1: MM/HFT filter — gọi Copin API TRƯỚC tất cả REST calls khác
const isHft = await this.checkIsHft(address);
if (isHft) {
  trade.flags.push(InsiderFlag.HFT_PATTERN);
  this.addLog(`[HFT] Skipped ${address.slice(0, 12)}… (maker rebate tier)`);
  return;  // ← tiết kiệm 3 REST calls: ledger + fills + clearinghouseState
}
```

**Cache:** Kết quả được cache 24 giờ trong `hftCache: Map<string, {isHft, cachedAt}>`.

**Quan sát thực tế (2026-03-03):**
```
[10:23:54] [HFT] Skipped 0xc926ddba8b… (maker rebate tier)
```
→ Filter bắt được MM address sau vài giây khởi động, trước khi tốn REST calls.

### 11.5. Layer 2: REST Pre-check (Backlog)

Sau khi lấy fills 90d, check trước khi tính full scoring — catch algo traders không có trong Copin MM tier:

```typescript
// Nếu quá nhiều fills → likely algo trader
const ALGO_FILL_THRESHOLD = 3_000;
if (fills.length > ALGO_FILL_THRESHOLD) {
  this.addLog(`[SKIP] ${address.slice(0,10)} algo (${fills.length} fills/90d)`);
  return;
}

// Nếu fills nhiều VÀ balanced buy/sell ratio → likely MM
if (fills.length > 500) {
  const buys  = fills.filter(f => f.side === 'B').length;
  const sells = fills.filter(f => f.side === 'A').length;
  const ratio = Math.min(buys, sells) / Math.max(buys, sells);
  if (ratio > 0.4) {
    this.addLog(`[SKIP] ${address.slice(0,10)} MM balanced (ratio=${ratio.toFixed(2)})`);
    return;
  }
}
```

### 11.6. Kết Quả Kỳ Vọng

| Metric | Trước filter | Sau Layer 0+1 | Sau Layer 0+1+2 |
|--------|-------------|--------------|----------------|
| % large trades là noise (MM/HFT/protocol) | ~65% | ~25% | ~15% |
| REST calls tốn cho noise | ~40/giờ | ~12/giờ | ~6/giờ |
| Rate limit pressure | Queue > 5 thường xuyên | Queue ≈ 0-2 | Queue ≈ 0 |

### 11.7. Giới Hạn

- MM không đủ volume để vào rebate tier → `userAddRate > 0` → sẽ bị inspect (ít false negative)
- Insider dùng ví MM cũ để nguỵ trang → sẽ bị miss (edge case cực hiếm, rủi ro cao cho insider)
- Copin API timeout/unavailable → `checkIsHft()` trả `false` → an toàn, không miss suspect
- Layer 2 fill balance check tốn 1 REST call/trader nhưng tránh được 2 calls tiếp theo
