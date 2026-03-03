import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  AlertLevel,
  InsiderFlag,
  InsiderScore,
  LargeTrade,
  RawTrade,
  SuspectEntry,
  TraderProfile,
  WalletType,
} from './dto/trade.dto';
import {
  maxSuspects,
  maxTradeHistory,
  megaTradeUsd,
  minTradeUsd,
  newTraderFillsThreshold,
  traderCacheTtlMs,
} from '../configs';
import { WsScannerService } from './ws-scanner.service';
import { RateLimiterService } from './rate-limiter.service';
import { HyperliquidInfoService } from '../frameworks/hyperliquid/hyperliquid-info.service';
import { LarkAlertService } from './lark-alert.service';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Zero address used by Hyperliquid for system fills — always skip */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** HFT cache TTL: 24 hours (MM tier status rarely changes) */
const HFT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Aggregation constants (from FRESH_DEPOSIT_STRATEGY.md) ──────────────────

/**
 * Sliding window: reset timer on every new fill.
 * Fills arriving within SLIDE_WINDOW_MS of the last fill are merged.
 * Recommended 500ms — wide enough for network jitter, narrow enough
 * to avoid merging two separate orders placed back-to-back.
 */
const SLIDE_WINDOW_MS = 500;

/**
 * Absolute cap from the first fill time.
 * Prevents a window from staying open indefinitely on continuous flow.
 */
const MAX_WINDOW_MS = 3_000;

// ─── Coin tier thresholds ─────────────────────────────────────────────────────

interface CoinTierInfo {
  dayNtlVlm: number;   // 24h notional volume USD
  openInterest: number; // OI in base token
  markPx: number;       // mark price
  notionalThreshold: number; // minimum aggregated notional to analyse
}

function calcNotionalThreshold(coin: string, dayNtlVlm: number): number {
  const BLUECHIPS = ['BTC', 'ETH', 'SOL'];
  if (BLUECHIPS.includes(coin) || dayNtlVlm > 100_000_000) return 500_000; // BLUECHIP
  if (dayNtlVlm > 10_000_000) return 100_000;  // MID_CAP
  if (dayNtlVlm > 500_000)    return 30_000;   // LOW_CAP
  return 10_000;                                 // MICRO_CAP
}

// ─── Aggregation buffer ───────────────────────────────────────────────────────

interface TradeBuffer {
  fills: RawTrade[];
  timer: ReturnType<typeof setTimeout>;
  /** The specific address we are aggregating for */
  address: string;
  /** 'B' = buyer side, 'A' = seller side (from this address's perspective) */
  side: 'B' | 'A';
  /** Timestamp of first fill — used to enforce MAX_WINDOW_MS cap */
  startedAt: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class InsiderDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InsiderDetectorService.name);

  /** Rolling window of the last N large (aggregated) trades */
  readonly largeTrades: LargeTrade[] = [];

  /** Address → suspect entry */
  readonly suspects = new Map<string, SuspectEntry>();

  /** Address → cached profile (TTL-based) */
  private readonly profileCache = new Map<string, TraderProfile>();

  /** Address → HFT/MM status (cached 24h from Copin API) */
  private readonly hftCache = new Map<string, { isHft: boolean; cachedAt: number }>();

  /** Addresses currently being inspected (dedup in-flight) */
  private readonly inspecting = new Set<string>();

  /**
   * Aggregation buffers: key = `${address}:${coin}:${side}`.
   * Tracks BOTH the buyer (users[0]) and the seller (users[1]) of every fill,
   * so large orders from either side are detected.
   */
  private readonly tradeBuffers = new Map<string, TradeBuffer>();

  /**
   * Per-coin dynamic thresholds refreshed every 60s from metaAndAssetCtxs.
   * Falls back to global minTradeUsd if coin not in map.
   */
  private readonly coinTiers = new Map<string, CoinTierInfo>();

  /** Log messages for the terminal / web UI */
  readonly logs: string[] = [];

  constructor(
    private readonly scanner: WsScannerService,
    private readonly rateLimiter: RateLimiterService,
    private readonly infoService: HyperliquidInfoService,
    private readonly lark: LarkAlertService,
  ) {}

  onModuleInit() {
    this.scanner.onTrade((raw) => this.bufferTrade(raw));
    // Warm coin tiers immediately on startup
    this.refreshCoinTiers();
  }

  onModuleDestroy() {
    // Cancel all pending timers
    for (const buf of this.tradeBuffers.values()) {
      clearTimeout(buf.timer);
    }
    this.tradeBuffers.clear();
  }

  // ─── Public helpers ───────────────────────────────────────────────────────────

  getSuspectsSorted(): SuspectEntry[] {
    return [...this.suspects.values()]
      .sort((a, b) => {
        const aScore = a.insiderScore + this.flagBonus(a) + a.totalUsd / 1_000_000;
        const bScore = b.insiderScore + this.flagBonus(b) + b.totalUsd / 1_000_000;
        return bScore - aScore;
      })
      .slice(0, maxSuspects);
  }

  addLog(msg: string) {
    const ts = new Date().toTimeString().slice(0, 8);
    this.logs.unshift(`[${ts}] ${msg}`);
    if (this.logs.length > 100) this.logs.length = 100;
  }

  // ─── Coin tier refresh ───────────────────────────────────────────────────────

  @Interval(60_000)
  async refreshCoinTiers() {
    try {
      const [metas, ctxs] = await this.infoService.getMetaAndAssetCtxs();
      for (let i = 0; i < metas.length; i++) {
        const coin = metas[i]?.name;
        const ctx = ctxs[i];
        if (!coin || !ctx) continue;
        const dayNtlVlm = parseFloat(ctx.dayNtlVlm || '0');
        const openInterest = parseFloat(ctx.openInterest || '0');
        const markPx = parseFloat(ctx.markPx || '0');
        this.coinTiers.set(coin, {
          dayNtlVlm,
          openInterest,
          markPx,
          notionalThreshold: calcNotionalThreshold(coin, dayNtlVlm),
        });
      }
    } catch (e) {
      this.logger.warn(`refreshCoinTiers failed: ${e.message}`);
    }
  }

  private getCoinThreshold(coin: string): number {
    return this.coinTiers.get(coin)?.notionalThreshold ?? minTradeUsd;
  }

  // ─── Aggregation buffer (sliding window, both sides) ─────────────────────────

  private bufferTrade(raw: RawTrade) {
    if (!raw.users) {
      // No user info — can't aggregate by address, skip
      return;
    }

    const [buyerAddr, sellerAddr] = raw.users;

    // Layer 0: skip zero address (Hyperliquid system fills)
    const isZero = (addr: string) => !addr || addr === ZERO_ADDRESS;

    // Track buyer side (users[0] is always the buyer)
    if (!isZero(buyerAddr)) this.accumulateFill(buyerAddr, 'B', raw);

    // Track seller side (users[1] is always the seller)
    if (!isZero(sellerAddr)) this.accumulateFill(sellerAddr, 'A', raw);
  }

  private accumulateFill(address: string, side: 'B' | 'A', raw: RawTrade) {
    const key = `${address}:${raw.coin}:${side}`;
    const existing = this.tradeBuffers.get(key);

    if (existing) {
      existing.fills.push(raw);

      // Sliding window: cancel old timer, schedule new one
      clearTimeout(existing.timer);

      const elapsed = Date.now() - existing.startedAt;
      if (elapsed >= MAX_WINDOW_MS) {
        // Already past the absolute cap — flush immediately
        this.tradeBuffers.delete(key);
        this.flushBuffer(existing);
        return;
      }

      const remaining = Math.min(SLIDE_WINDOW_MS, MAX_WINDOW_MS - elapsed);
      existing.timer = setTimeout(() => {
        this.tradeBuffers.delete(key);
        this.flushBuffer(existing);
      }, remaining);
    } else {
      const buf: TradeBuffer = {
        fills: [raw],
        address,
        side,
        startedAt: Date.now(),
        timer: null!,
      };
      buf.timer = setTimeout(() => {
        this.tradeBuffers.delete(key);
        this.flushBuffer(buf);
      }, SLIDE_WINDOW_MS);
      this.tradeBuffers.set(key, buf);
    }
  }

  // ─── Flush & process ──────────────────────────────────────────────────────────

  private flushBuffer(buf: TradeBuffer) {
    const { fills, address, side } = buf;
    if (fills.length === 0) return;

    let totalSz = 0;
    let totalNotional = 0;

    for (const f of fills) {
      const px = parseFloat(f.px);
      const sz = parseFloat(f.sz);
      if (!px || !sz) continue;
      totalSz += sz;
      totalNotional += px * sz;
    }

    if (totalSz === 0) return;

    // Use per-coin dynamic threshold
    const threshold = this.getCoinThreshold(fills[0].coin);
    if (totalNotional < threshold) return;

    const avgPrice = totalNotional / totalSz;
    const first = fills[0];

    const flags: InsiderFlag[] = [InsiderFlag.LARGE_TRADE];
    if (totalNotional >= megaTradeUsd) flags.push(InsiderFlag.MEGA_TRADE);

    const trade: LargeTrade = {
      coin: first.coin,
      side: side === 'B' ? 'BUY' : 'SELL',
      price: avgPrice,
      sizeCoin: totalSz,
      usdSize: totalNotional,
      fillCount: fills.length,
      hash: first.hash,
      time: first.time,
      takerAddress: address,
      makerAddress: null,
      flags,
      detectedAt: Date.now(),
    };

    this.processLargeTrade(trade);
  }

  // ─── Trade processing ─────────────────────────────────────────────────────────

  private processLargeTrade(trade: LargeTrade) {
    // Keep rolling window
    this.largeTrades.unshift(trade);
    if (this.largeTrades.length > maxTradeHistory) {
      this.largeTrades.length = maxTradeHistory;
    }

    this.scanner.stats.largeTradesFound++;

    const fillNote = trade.fillCount > 1 ? ` (${trade.fillCount} fills)` : '';
    this.addLog(
      `${trade.coin} ${trade.side} ${fmtUsd(trade.usdSize)}${fillNote} @ ${fmtPrice(trade.price)}` +
      (trade.takerAddress ? ` by ${trade.takerAddress}` : ''),
    );

    // Fire Lark alert immediately for mega trades (no need to wait for profile)
    if (trade.usdSize >= megaTradeUsd) {
      this.lark.alertMegaTrade(trade).catch(() => null);
    }

    // Queue async profile + ledger inspection for the detected address
    if (trade.takerAddress) {
      this.queueInspect(trade.takerAddress, trade);
    }
  }

  // ─── Profile inspection ───────────────────────────────────────────────────────

  private queueInspect(address: string, trade: LargeTrade) {
    if (this.inspecting.has(address)) return;
    this.inspecting.add(address);

    this.rateLimiter
      .enqueue(() => this.inspectTrader(address, trade))
      .finally(() => {
        this.inspecting.delete(address);
        this.scanner.stats.queueLength = this.rateLimiter.queueLength;
      });

    this.scanner.stats.queueLength = this.rateLimiter.queueLength;
  }

  /**
   * Layer 1 HFT filter: calls Copin API to get user fee tier.
   * Returns true if userAddRate <= 0 (maker rebate tier = market maker / HFT).
   * Results are cached for 24 hours to avoid hammering the API.
   */
  private async checkIsHft(address: string): Promise<boolean> {
    const cached = this.hftCache.get(address);
    if (cached && Date.now() - cached.cachedAt < HFT_CACHE_TTL_MS) {
      return cached.isHft;
    }

    try {
      const fees = await this.infoService.getUserFees(address);
      const isHft = fees != null && parseFloat(fees.userAddRate) <= 0;
      this.hftCache.set(address, { isHft, cachedAt: Date.now() });
      return isHft;
    } catch {
      // On error, assume not HFT to avoid false negatives
      return false;
    }
  }

  private async inspectTrader(address: string, trade: LargeTrade) {
    try {
      // Layer 1: MM/HFT filter — skip market makers (userAddRate <= 0)
      const isHft = await this.checkIsHft(address);
      if (isHft) {
        if (!trade.flags.includes(InsiderFlag.HFT_PATTERN)) {
          trade.flags.push(InsiderFlag.HFT_PATTERN);
        }
        this.addLog(`[HFT] Skipped ${address.slice(0, 12)}… (maker rebate tier)`);
        return;
      }

      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

      // Fetch ledger first (key signal: deposit-to-trade gap)
      const ledger = await this.infoService.getUserNonFundingLedger(address);
      await sleep(400);
      const fills = await this.infoService.getUserFills(address, ninetyDaysAgo);
      await sleep(400);
      const state = await this.infoService.getClearinghouseState(address);

      if (!state) return;

      const accountValue = parseFloat(state.marginSummary?.accountValue ?? '0');

      // Composite scoring from FRESH_DEPOSIT_STRATEGY
      const scoring = this.scoreTrader(trade, ledger, fills, state);

      // Merge extra flags into trade record
      for (const f of scoring.extraFlags) {
        if (!trade.flags.includes(f)) trade.flags.push(f);
      }

      // Backwards-compat flags based on 90-day fill count
      if (fills.length === 0) {
        if (!trade.flags.includes(InsiderFlag.FIRST_TIMER)) {
          trade.flags.push(InsiderFlag.FIRST_TIMER);
        }
      } else if (fills.length < newTraderFillsThreshold) {
        if (!trade.flags.includes(InsiderFlag.NEW_ACCOUNT)) {
          trade.flags.push(InsiderFlag.NEW_ACCOUNT);
        }
      }

      // Only upsert suspects that score above LOW threshold
      if (scoring.alertLevel === AlertLevel.NONE) return;

      const profile: TraderProfile = {
        address,
        fillCount90d: fills.length,
        accountValue,
        fetchedAt: Date.now(),
      };

      this.upsertSuspect(address, trade, profile, scoring);
    } catch (e) {
      this.logger.error(`inspectTrader(${address}): ${e.message}`);
    }
  }

  // ─── Composite Scoring (FRESH_DEPOSIT_STRATEGY §4) ──────────────────────────

  private scoreTrader(
    trade: LargeTrade,
    ledger: any[],
    fills: any[],
    state: any,
  ): InsiderScore {
    const extraFlags: InsiderFlag[] = [];

    // Parse ledger entries
    const deposits     = ledger.filter(l => l.delta?.type === 'deposit');
    const withdrawals  = ledger.filter(l => l.delta?.type === 'withdraw');
    const ledgerTypes  = new Set<string>(ledger.map(l => l.delta?.type).filter(Boolean));

    const lastDepositTime = deposits.length > 0
      ? Math.max(...deposits.map(d => d.time))
      : 0;
    const totalDepositsUsd = deposits.reduce((sum, d) => sum + parseFloat(d.delta.usdc || '0'), 0);

    const firstActivity = ledger.length > 0
      ? Math.min(...ledger.map(l => l.time))
      : Date.now();
    const walletAgeDays = (Date.now() - firstActivity) / (1000 * 60 * 60 * 24);

    // ── [A] Deposit-to-Trade Speed (0–25 pts) ────────────────────────────────

    let scoreA = 0;
    let depositToTradeGapMs: number | null = null;

    if (lastDepositTime > 0) {
      // Use detectedAt (scanner detection time ≈ now) instead of trade.time
      // because the WS channel may replay historical fills on connect, making
      // trade.time stale while the ledger always reflects current state.
      const gapMs = trade.detectedAt - lastDepositTime;
      depositToTradeGapMs = gapMs;
      const gapMin = gapMs / 60_000;

      if      (gapMin <= 5)    scoreA = 25;
      else if (gapMin <= 15)   scoreA = 22;
      else if (gapMin <= 30)   scoreA = 18;
      else if (gapMin <= 60)   scoreA = 14;
      else if (gapMin <= 180)  scoreA = 10;
      else if (gapMin <= 360)  scoreA =  6;
      else if (gapMin <= 1440) scoreA =  3;

      if (gapMin <= 5) extraFlags.push(InsiderFlag.FRESH_DEPOSIT);

      // Bonus: nearly all deposit used for this trade
      if (totalDepositsUsd > 0 && trade.usdSize / totalDepositsUsd > 0.8) {
        scoreA = Math.min(25, scoreA + 3);
      }
    }

    // ── [B] Wallet Freshness (0–20 pts) ─────────────────────────────────────

    let scoreB = 0;

    if      (walletAgeDays < 1)  scoreB += 10;
    else if (walletAgeDays < 3)  scoreB += 8;
    else if (walletAgeDays < 7)  scoreB += 6;
    else if (walletAgeDays < 14) scoreB += 4;
    else if (walletAgeDays < 30) scoreB += 2;

    const fillCount = fills.length;
    if      (fillCount === 0)  scoreB += 10;
    else if (fillCount <= 3)   scoreB += 8;
    else if (fillCount <= 10)  scoreB += 5;
    else if (fillCount <= 30)  scoreB += 2;

    scoreB = Math.min(20, scoreB);

    // ── [C] Trade Size vs Market Context (0–20 pts) ──────────────────────────

    let scoreC = 0;
    const coinTier = this.coinTiers.get(trade.coin);

    if (coinTier) {
      const dayNtlVlm = coinTier.dayNtlVlm;
      const oiUsd = coinTier.openInterest * coinTier.markPx;

      const vlmRatio = dayNtlVlm > 0 ? trade.usdSize / dayNtlVlm : 1;

      if (dayNtlVlm < 100_000 && trade.usdSize > 10_000) {
        scoreC += 12;
        extraFlags.push(InsiderFlag.DEAD_MARKET);
      } else if (vlmRatio > 0.10) scoreC += 10;
      else if   (vlmRatio > 0.05) scoreC += 7;
      else if   (vlmRatio > 0.01) scoreC += 4;

      if (oiUsd > 0) {
        const oiRatio = trade.usdSize / oiUsd;
        if      (oiRatio > 0.10) { scoreC += 8; extraFlags.push(InsiderFlag.HIGH_OI_RATIO); }
        else if (oiRatio > 0.05) scoreC += 6;
        else if (oiRatio > 0.01) scoreC += 3;
      }

      scoreC = Math.min(20, scoreC);
    }

    // ── [D] Position Concentration (0–15 pts) ────────────────────────────────

    let scoreD = 0;
    const accountValue = parseFloat(state.marginSummary?.accountValue ?? '0');
    const marginUsed   = parseFloat(state.marginSummary?.totalMarginUsed ?? '0');

    if (accountValue > 0) {
      const marginUtil = marginUsed / accountValue;

      if      (marginUtil > 0.9) { scoreD += 8; extraFlags.push(InsiderFlag.ALL_IN); }
      else if (marginUtil > 0.7) scoreD += 5;
      else if (marginUtil > 0.5) scoreD += 3;

      const impliedLeverage = trade.usdSize / accountValue;
      if (impliedLeverage >= 20) { scoreD += 3; extraFlags.push(InsiderFlag.HIGH_LEVERAGE); }

      // Used most of deposit as margin
      if (totalDepositsUsd > 0 && marginUsed / totalDepositsUsd > 0.9) scoreD += 4;

      scoreD = Math.min(15, scoreD);
    }

    // ── [E] Ledger Purity (0–10 pts) ─────────────────────────────────────────

    let scoreE = 0;
    const isDepositOnly = withdrawals.length === 0 && deposits.length > 0;

    if (isDepositOnly) { scoreE += 5; extraFlags.push(InsiderFlag.DEPOSIT_ONLY); }
    if (ledgerTypes.size === 1 && ledgerTypes.has('deposit')) scoreE += 3;
    if (!ledgerTypes.has('rewardsClaim') && walletAgeDays < 30) scoreE += 2;
    scoreE = Math.min(10, scoreE);

    // ── [F] Behavioral Multiplier (×1.0–1.5) ─────────────────────────────────

    let multiplier = 1.0;
    const hasImmediate  = scoreA >= 22;          // deposit < 15 min
    const hasFreshWallet = fillCount === 0 || walletAgeDays < 1;
    const hasAllIn      = extraFlags.includes(InsiderFlag.ALL_IN);
    const hasDeadMarket = extraFlags.includes(InsiderFlag.DEAD_MARKET);

    if (hasImmediate && hasFreshWallet)             multiplier += 0.20;
    if (hasImmediate && hasAllIn)                   multiplier += 0.15;
    if (hasFreshWallet && hasDeadMarket)            multiplier += 0.15;
    if (hasImmediate && hasFreshWallet && hasAllIn) multiplier += 0.10; // triple combo
    multiplier = Math.min(1.5, multiplier);

    // ── Wallet type classification ────────────────────────────────────────────

    let walletType: WalletType;
    if (isDepositOnly && fillCount <= 5 && walletAgeDays < 14) {
      walletType = WalletType.GHOST;
      extraFlags.push(InsiderFlag.GHOST_WALLET);
    } else if (deposits.length <= 2 && fillCount <= 3 && walletAgeDays < 7) {
      walletType = WalletType.ONE_SHOT;
      extraFlags.push(InsiderFlag.ONE_SHOT);
    } else if (walletAgeDays < 30 && fillCount < 20) {
      walletType = WalletType.FRESH;
    } else if (accountValue > 1_000_000) {
      walletType = WalletType.WHALE;
    } else {
      walletType = WalletType.NORMAL;
    }

    // ── Final score ───────────────────────────────────────────────────────────

    const rawScore  = scoreA + scoreB + scoreC + scoreD + scoreE;
    const finalScore = Math.min(100, Math.round(rawScore * multiplier));

    let alertLevel: AlertLevel;
    if      (finalScore >= 75) alertLevel = AlertLevel.CRITICAL;
    else if (finalScore >= 55) alertLevel = AlertLevel.HIGH;
    else if (finalScore >= 40) alertLevel = AlertLevel.MEDIUM;
    else if (finalScore >= 25) alertLevel = AlertLevel.LOW;
    else                       alertLevel = AlertLevel.NONE;

    return {
      finalScore,
      alertLevel,
      walletType,
      depositToTradeGapMs,
      extraFlags,
      components: { scoreA, scoreB, scoreC, scoreD, scoreE, multiplier },
    };
  }

  // ─── Suspect registry ─────────────────────────────────────────────────────────

  private upsertSuspect(
    address: string,
    trade: LargeTrade,
    profile: TraderProfile,
    scoring: InsiderScore,
  ) {
    const existing = this.suspects.get(address);

    if (existing) {
      existing.totalUsd += trade.usdSize;
      existing.tradeCount++;
      existing.coins.add(trade.coin);
      for (const f of [...trade.flags, ...scoring.extraFlags]) {
        existing.flags.add(f);
      }
      existing.lastSeenAt = Date.now();
      existing.profile = profile;
      // Update score if new score is higher
      if (scoring.finalScore > existing.insiderScore) {
        existing.insiderScore = scoring.finalScore;
        existing.alertLevel   = scoring.alertLevel;
        existing.walletType   = scoring.walletType;
      }
      if (scoring.depositToTradeGapMs !== null) {
        existing.depositToTradeGapMs = scoring.depositToTradeGapMs;
      }
    } else {
      const newSuspect: SuspectEntry = {
        address,
        totalUsd: trade.usdSize,
        tradeCount: 1,
        coins: new Set([trade.coin]),
        flags: new Set([...trade.flags, ...scoring.extraFlags]),
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        profile,
        insiderScore: scoring.finalScore,
        alertLevel: scoring.alertLevel,
        walletType: scoring.walletType,
        depositToTradeGapMs: scoring.depositToTradeGapMs,
      };
      this.suspects.set(address, newSuspect);
      this.scanner.stats.suspectsFound = this.suspects.size;

      const levelTag = `[${scoring.alertLevel} ${scoring.finalScore}/100]`;
      this.addLog(
        `*** SUSPECT ${levelTag}: ${address} [${[...newSuspect.flags].join(',')}] ` +
        `${trade.coin} ${fmtUsd(trade.usdSize)}`,
      );
      this.lark.alertSuspect(newSuspect, trade).catch(() => null);
    }

    this.scanner.stats.suspectsFound = this.suspects.size;
    this.scanner.stats.queueLength   = this.rateLimiter.queueLength;
  }

  // ─── Sorting helpers ──────────────────────────────────────────────────────────

  private flagBonus(entry: SuspectEntry): number {
    let bonus = 0;
    if (entry.flags.has(InsiderFlag.GHOST_WALLET)) bonus += 15;
    if (entry.flags.has(InsiderFlag.ONE_SHOT))     bonus += 12;
    if (entry.flags.has(InsiderFlag.FRESH_DEPOSIT)) bonus += 10;
    if (entry.flags.has(InsiderFlag.FIRST_TIMER))  bonus += 8;
    if (entry.flags.has(InsiderFlag.ALL_IN))        bonus += 6;
    if (entry.flags.has(InsiderFlag.MEGA_TRADE))    bonus += 5;
    if (entry.flags.has(InsiderFlag.NEW_ACCOUNT))   bonus += 4;
    return bonus;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1_000)   return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1)       return `$${n.toFixed(3)}`;
  if (n >= 0.0001)  return `$${n.toFixed(6)}`;
  return `$${n.toExponential(3)}`;
}