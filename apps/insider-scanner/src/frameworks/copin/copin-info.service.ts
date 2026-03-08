import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { copinApiKey, copinApiUrl, copinEnabled, copinRateLimitMs } from '../../configs';
import type { CopinProfile } from '../../scanner/dto/trade.dto';

// ─── Public types ─────────────────────────────────────────────────────────────

export { CopinProfile };

export interface CopinD30 {
  winRate: number;
  totalTrade: number;
  totalWin: number;
  totalLose: number;
  totalLiquidation: number;
  realisedPnl: number;
  realisedMaxDrawdown: number;
  profitLossRatio: number;
  realisedAvgRoi: number;
  avgLeverage: number;
  maxLeverage: number;
  avgDuration: number;       // seconds
  longRate: number;          // 0–100
  orderPositionRatio: number;
  runTimeDays: number;
  lastTradeAtTs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTOCOL  = 'HYPERLIQUID';
const CACHE_TTL = 30 * 60_000;   // 30 min — Copin stats change slowly

const UNKNOWN_CLASS: CopinProfile = {
  archetype: 'UNKNOWN',
  confidence: 0,
  signals: [],
  scoreG: 0,
  d30: null,
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CopinInfoService implements OnModuleInit {
  private readonly logger = new Logger(CopinInfoService.name);

  /** Per-address cache: address → { classification, fetchedAt } */
  private readonly cache = new Map<string, { data: CopinProfile; fetchedAt: number }>();

  /** Timestamp of last REST call — used to enforce min gap */
  private lastCallAt = 0;

  onModuleInit() {
    if (!copinEnabled) {
      this.logger.warn(
        'Copin API disabled — COPIN_API_KEY not set or COPIN_ENABLED=false. ' +
        'Scoring component G will be 0 for all wallets.',
      );
    } else {
      this.logger.log(`Copin API enabled. Base: ${copinApiUrl}`);
    }
  }

  /**
   * Classify a wallet using Copin D30 stats.
   * Returns UNKNOWN if Copin is disabled or the API call fails (graceful fallback).
   */
  async getClassification(address: string): Promise<CopinProfile> {
    if (!copinEnabled) return UNKNOWN_CLASS;

    const cached = this.cache.get(address);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.data;
    }

    await this.rateLimit();

    const d30 = await this.fetchD30(address);
    const result = classifyFromD30(d30);
    this.cache.set(address, { data: result, fetchedAt: Date.now() });
    return result;
  }

  /**
   * Bulk-fetch addresses of algorithmic/HFT traders on Hyperliquid.
   * Used to build Layer 2 algo whitelist (refreshed every 6h).
   */
  async fetchAlgoTraderAddresses(): Promise<string[]> {
    if (!copinEnabled) return [];
    await this.rateLimit();
    try {
      const res = await this.postFilter({
        ranges: [
          { fieldName: 'totalTrade',         gte: 200 },
          { fieldName: 'avgDuration',         lte: 3600 },
          { fieldName: 'orderPositionRatio',  gte: 3 },
        ],
        sortBy: 'totalTrade',
      });
      return this.extractAddresses(res);
    } catch (e) {
      this.logger.warn(`Copin algo scan failed: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * Bulk-fetch top-N addresses by 30-day realised PnL.
   * Used by LeaderboardMonitorService to pre-warm cache and detect unusual-coin trades.
   */
  async fetchLeaderboardAddresses(limit = 100): Promise<string[]> {
    if (!copinEnabled) return [];
    await this.rateLimit();
    try {
      const data = await this.postFilter(
        {
          ranges: [
            { fieldName: 'totalTrade',  gte: 5 },
            { fieldName: 'runTimeDays', gte: 7 },
          ],
          sortBy: 'realisedPnl',
        },
        limit,
      );
      const addrs = this.extractAddresses(data);
      this.logger.warn(`[Leaderboard] Copin returned ${addrs.length} addresses (total=${data?.total ?? '?'})`);
      return addrs;
    } catch (e) {
      this.logger.warn(`Copin leaderboard fetch failed: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * Bulk-fetch addresses of established smart traders on Hyperliquid.
   * Used to build smart-trader whitelist (increases FP-filter threshold to 55).
   */
  async fetchSmartTraderAddresses(): Promise<string[]> {
    if (!copinEnabled) return [];
    await this.rateLimit();
    try {
      const res = await this.postFilter({
        ranges: [
          { fieldName: 'winRate',          gte: 55 },
          { fieldName: 'realisedPnl',      gte: 10_000 },
          { fieldName: 'profitLossRatio',  gte: 1.5 },
          { fieldName: 'totalTrade',       gte: 20 },
          { fieldName: 'runTimeDays',      gte: 30 },
        ],
        sortBy: 'realisedPnl',
      });
      return this.extractAddresses(res);
    } catch (e) {
      this.logger.warn(`Copin smart trader scan failed: ${(e as Error).message}`);
      return [];
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async fetchD30(address: string): Promise<CopinD30 | null> {
    try {
      const res = await fetch(
        `${copinApiUrl}/${PROTOCOL}/position-statistic/${address}`,
        {
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': copinApiKey },
          signal: AbortSignal.timeout(5_000),
        },
      );

      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(`Copin ${address.slice(0, 10)}: HTTP ${res.status}`);
        return null;
      }

      const data = await res.json() as Record<string, any>;
      const d30  = data?.D30;
      if (!d30 || toNum(d30.totalTrade) < 5) return null;

      return {
        winRate:             toNum(d30.winRate),
        totalTrade:          toNum(d30.totalTrade),
        totalWin:            toNum(d30.totalWin),
        totalLose:           toNum(d30.totalLose),
        totalLiquidation:    toNum(d30.totalLiquidation),
        realisedPnl:         toNum(d30.realisedPnl),
        realisedMaxDrawdown: toNum(d30.realisedMaxDrawdown),
        profitLossRatio:     toNum(d30.profitLossRatio),
        realisedAvgRoi:      toNum(d30.realisedAvgRoi),
        avgLeverage:         toNum(d30.avgLeverage),
        maxLeverage:         toNum(d30.maxLeverage),
        avgDuration:         toNum(d30.avgDuration),
        longRate:            toNum(d30.longRate),
        orderPositionRatio:  toNum(d30.orderPositionRatio),
        runTimeDays:         toNum(d30.runTimeDays),
        lastTradeAtTs:       toNum(d30.lastTradeAtTs),
      };
    } catch (e) {
      this.logger.warn(`Copin fetch ${address.slice(0, 10)}: ${(e as Error).message}`);
      return null;
    }
  }

  private async postFilter(opts: {
    ranges: { fieldName: string; gte?: number; lte?: number }[];
    sortBy: string;
  }, limit = 200): Promise<any> {
    const res = await fetch(`${copinApiUrl}/public/${PROTOCOL}/position/statistic/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': copinApiKey },
      body: JSON.stringify({
        pagination: { limit, offset: 0 },
        queries:    [{ fieldName: 'type', value: 'D30' }],
        ranges:     opts.ranges,
        sortBy:     opts.sortBy,
        sortType:   'desc',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      this.logger.warn(`Copin filter HTTP ${res.status} (sortBy=${opts.sortBy})`);
      return null;
    }
    return res.json();
  }

  private extractAddresses(data: any): string[] {
    return ((data?.data ?? []) as any[])
      .map((d) => String(d.account ?? '').toLowerCase())
      .filter(Boolean);
  }

  /** Enforce minimum gap between successive Copin calls (rate limit: 30 req/min). */
  private async rateLimit() {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < copinRateLimitMs) {
      await sleep(copinRateLimitMs - elapsed);
    }
    this.lastCallAt = Date.now();
  }
}

// ─── Classification logic ─────────────────────────────────────────────────────

/**
 * Classify a trader based on Copin D30 statistics.
 *
 * Priority order (first match wins):
 *   1. ALGO_HFT       → hard skip (G = −10)
 *   2. INSIDER_SUSPECT strong → G = +10
 *   3. SMART_TRADER   → FP filter (G = −8)
 *   4. DEGEN          → bad trader (G = −5)
 *   5. INSIDER_SUSPECT mild → G = +5
 *   6. NORMAL         → G = 0
 *
 * SAFETY: null / insufficient data → UNKNOWN (G = 0, never penalises fresh accounts).
 */
export function classifyFromD30(d30: CopinD30 | null): CopinProfile {
  if (!d30 || d30.totalTrade < 5) return UNKNOWN_CLASS;

  // 1. Algo / HFT
  if (d30.totalTrade >= 200 && d30.avgDuration <= 3_600 && d30.orderPositionRatio >= 3) {
    return {
      archetype: 'ALGO_HFT',
      confidence: 0.9,
      signals: [
        `${d30.totalTrade} trades/30d`,
        `avg hold ${Math.round(d30.avgDuration / 60)}min`,
        `${d30.orderPositionRatio.toFixed(1)} orders/pos`,
      ],
      scoreG: -10,
      d30: toD30Snapshot(d30),
    };
  }

  // 2. Strong insider suspect
  if (
    d30.winRate >= 80 &&
    d30.totalTrade <= 20 &&
    d30.avgDuration <= 86_400 &&
    d30.totalLiquidation === 0
  ) {
    return {
      archetype: 'INSIDER_SUSPECT',
      confidence: 0.8,
      signals: [
        `${d30.winRate.toFixed(0)}% WR`,
        `${d30.totalTrade} trades`,
        `avg hold ${Math.round(d30.avgDuration / 3_600)}h`,
        'no liq',
      ],
      scoreG: 10,
      d30: toD30Snapshot(d30),
    };
  }

  // 3. Established smart trader — reduce FP risk
  if (
    d30.winRate >= 55 &&
    d30.profitLossRatio >= 1.5 &&
    d30.realisedPnl >= 10_000 &&
    d30.runTimeDays >= 30
  ) {
    return {
      archetype: 'SMART_TRADER',
      confidence: 0.85,
      signals: [
        `${d30.winRate.toFixed(0)}% WR`,
        `PL ${d30.profitLossRatio.toFixed(1)}x`,
        `$${Math.round(d30.realisedPnl / 1_000)}k PnL`,
        `${d30.runTimeDays}d old`,
      ],
      scoreG: -8,
      d30: toD30Snapshot(d30),
    };
  }

  // 4. Degen
  if (d30.totalLiquidation >= 3 && d30.avgLeverage >= 30) {
    return {
      archetype: 'DEGEN',
      confidence: 0.75,
      signals: [`${d30.totalLiquidation} liq`, `avg ${d30.avgLeverage.toFixed(0)}x lev`],
      scoreG: -5,
      d30: toD30Snapshot(d30),
    };
  }

  // 5. Mild insider suspect
  if (d30.winRate >= 65 && d30.totalTrade <= 30 && d30.realisedAvgRoi >= 20) {
    return {
      archetype: 'INSIDER_SUSPECT',
      confidence: 0.5,
      signals: [`${d30.winRate.toFixed(0)}% WR`, `avg ROI ${d30.realisedAvgRoi.toFixed(0)}%`],
      scoreG: 5,
      d30: toD30Snapshot(d30),
    };
  }

  return { archetype: 'NORMAL', confidence: 0.6, signals: [], scoreG: 0, d30: toD30Snapshot(d30) };
}

function toD30Snapshot(d30: CopinD30): CopinProfile['d30'] {
  return {
    winRate:          d30.winRate,
    totalTrade:       d30.totalTrade,
    totalLiquidation: d30.totalLiquidation,
    realisedPnl:      d30.realisedPnl,
    avgLeverage:      d30.avgLeverage,
    avgDuration:      d30.avgDuration,
    runTimeDays:      d30.runTimeDays,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely convert any Copin field value to number (handles lossless-json objects). */
function toNum(v: unknown): number {
  if (v == null)            return 0;
  if (typeof v === 'number') return v;
  // lossless-json wraps big numbers as { value: '123' }
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return parseFloat(String((v as Record<string, unknown>).value)) || 0;
  }
  return parseFloat(String(v)) || 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
