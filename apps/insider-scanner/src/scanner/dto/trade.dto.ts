export enum InsiderFlag {
  // Basic size flags
  LARGE_TRADE = 'LARGE',     // Aggregated notional > tier threshold
  MEGA_TRADE  = 'MEGA',      // Aggregated notional > megaTradeUsd

  // Historical-fill based (old logic, kept for compat)
  NEW_ACCOUNT = 'NEW_ACCT',  // < newTraderFillsThreshold fills in last 90 days
  FIRST_TIMER = 'FIRST',     // 0 fills in last 90 days

  // Deposit-speed flags (from ledger analysis)
  FRESH_DEPOSIT = 'FRESH_DEP',  // Last deposit < 5 min before trade
  DEPOSIT_ONLY  = 'DEP_ONLY',   // Wallet only has deposits (no withdrawals/transfers out)

  // Wallet pattern flags
  GHOST_WALLET = 'GHOST',    // Deposit-only, ≤5 fills, wallet age < 14 days
  ONE_SHOT     = 'ONE_SHOT', // ≤2 deposits, ≤3 fills, wallet age < 7 days

  // Position flags
  ALL_IN         = 'ALL_IN',   // Margin utilization > 90%
  HIGH_LEVERAGE  = 'HIGH_LEV', // Implied leverage ≥ 20x

  // Market context flags
  DEAD_MARKET    = 'DEAD_MKT',   // Trade on coin with nearly-zero 24h volume
  HIGH_OI_RATIO  = 'HIGH_OI',    // Trade notional > 10% of coin's open interest
  VOLUME_SPIKE   = 'VOL_SPIKE',  // Today's 24h volume > 3× EMA baseline (news/event day → less suspicious)
  NEW_LISTING    = 'NEW_LIST',   // Coin appeared in allPerpMetas < 48h ago (post-startup detection)

  // Noise filter flags (skipped from suspect list)
  HFT_PATTERN    = 'HFT',      // userAddRate <= 0 via Copin API → market maker / HFT, skip inspection

  // Copin-derived flags (v3.0)
  COPIN_SUSPICIOUS = 'COPIN_SUSP',  // Copin: high win rate + few trades + short hold → insider pattern
  SMART_TRADER     = 'SMART',       // Copin: established profitable trader (FP signal)

  // Phase 2 cluster + leaderboard flags
  LINKED_SUSPECT   = 'LINKED',      // Depositor/controller is already a known suspect
  LEADERBOARD_COIN = 'LB_COIN',     // Leaderboard wallet trading an unusual coin
}

export enum AlertLevel {
  CRITICAL = 'CRITICAL',  // score ≥ 75  🔴
  HIGH     = 'HIGH',      // score ≥ 55  🟠
  MEDIUM   = 'MEDIUM',    // score ≥ 40  🟡
  LOW      = 'LOW',       // score ≥ 25  🔵
  NONE     = 'NONE',      // score < 25  ⚪
}

export enum WalletType {
  GHOST       = 'GHOST',       // Deposit-only, ≤5 fills, age < 14d
  ONE_SHOT    = 'ONE_SHOT',    // ≤2 deposits, ≤3 fills, age < 7d
  FRESH       = 'FRESH',       // age < 30d and < 20 fills
  SUB_ACCOUNT = 'SUB_ACCOUNT', // Funded via internal transfer
  WHALE       = 'WHALE',       // Account value > $1M
  NORMAL      = 'NORMAL',      // Regular trader
}

/** Raw trade object from Hyperliquid trades WebSocket channel */
export interface RawTrade {
  coin: string;
  side: 'B' | 'A';   // B = buyer aggressor (buy taker), A = seller aggressor (sell taker)
  px: string;         // execution price as string
  sz: string;         // size in base coin as string
  hash: string;       // transaction hash
  time: number;       // Unix timestamp ms
  tid: number;        // trade id — unique per fill
  users?: [string, string]; // [buyerAddress, sellerAddress]
}

/** A large trade above the USD threshold (aggregated from multiple partial fills) */
export interface LargeTrade {
  coin: string;
  side: 'BUY' | 'SELL';
  price: number;       // VWAP across all fills
  sizeCoin: number;    // total size in base coin
  usdSize: number;     // total notional USD
  fillCount: number;   // number of partial fills aggregated (1 = single fill)
  hash: string;        // hash of the first fill
  time: number;        // timestamp of the first fill
  takerAddress: string | null;   // the detected large-order party (buyer or seller)
  makerAddress: string | null;
  flags: InsiderFlag[];
  detectedAt: number;  // Date.now()
}

/** Profile fetched from REST API for a trader involved in a large trade */
export interface TraderProfile {
  address: string;
  fillCount90d: number;    // fills in last 90 days
  accountValue: number;    // current account value in USD
  fetchedAt: number;       // Date.now() when fetched (for cache TTL)
}

/** Scoring result from composite insider analysis */
export interface InsiderScore {
  finalScore: number;       // 0–100
  alertLevel: AlertLevel;
  walletType: WalletType;
  depositToTradeGapMs: number | null;  // null = no deposit found in ledger
  extraFlags: InsiderFlag[];
  components: {
    scoreA: number;   // Deposit-to-Trade Speed   0-25
    scoreB: number;   // Wallet Freshness         0-20
    scoreC: number;   // Trade Size vs Market     0-20
    scoreD: number;   // Position Concentration   0-15
    scoreE: number;   // Ledger Purity            0-10
    scoreG: number;   // Copin Behavioral Score   -10 to +15
    multiplier: number;
  };
}

/** Copin classification snapshot stored on suspect entry */
export interface CopinProfile {
  archetype: 'ALGO_HFT' | 'SMART_TRADER' | 'DEGEN' | 'INSIDER_SUSPECT' | 'NORMAL' | 'UNKNOWN';
  confidence: number;
  signals: string[];
  scoreG: number;
  d30: {
    winRate: number;
    totalTrade: number;
    totalLiquidation: number;
    realisedPnl: number;
    avgLeverage: number;
    avgDuration: number;   // seconds
    runTimeDays: number;
  } | null;
}

/** Aggregate suspect entry built up over time */
export interface SuspectEntry {
  address: string;
  totalUsd: number;           // cumulative USD across all large trades
  tradeCount: number;
  coins: Set<string>;
  flags: Set<InsiderFlag>;
  firstSeenAt: number;
  lastSeenAt: number;
  profile: TraderProfile | null;

  // Scoring fields (populated after ledger analysis)
  insiderScore: number;                // 0-100 composite score
  alertLevel: AlertLevel;
  walletType: WalletType | null;
  depositToTradeGapMs: number | null;  // last known deposit-to-trade gap

  // Copin behavioral classification (v3.0, may be null if Copin disabled/unavailable)
  copinProfile: CopinProfile | null;

  // Phase 2: cluster + leaderboard fields
  linkedSuspectAddress: string | null;   // send-graph cluster hit: address that funded this wallet
  isLeaderboardWallet: boolean;          // true if wallet appears in top-100 Copin leaderboard
}

/** WebSocket connection stats */
export interface WsStats {
  connected: boolean;
  reconnects: number;
  tradesReceived: number;
  largeTradesFound: number;
  suspectsFound: number;
  lastMessageAt: number | null;
  subscribedCoins: number;
  queueLength: number;
  /** Timestamp of last successful reconnection */
  lastReconnectAt: number | null;
  /** Total milliseconds spent disconnected since startup */
  totalDowntimeMs: number;
  /** Current consecutive connection failures (resets on success) */
  consecutiveFailures: number;
}