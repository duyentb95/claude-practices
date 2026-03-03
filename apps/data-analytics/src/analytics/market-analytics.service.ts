import { Injectable, Logger } from '@nestjs/common';
import { HyperliquidInfoService } from '../frameworks/hyperliquid/hyperliquid-info.service';
import { CacheService } from '../frameworks/cache-service/cache.service';
import { MarketDataDto, MarketSnapshotDto, LeaderboardEntryDto } from '../dto/market.dto';
import { CandleDto } from '../dto/fill.dto';
import {
  REDIS_KEY,
  CandleInterval,
  LeaderboardWindow,
  MARKET_SNAPSHOT_TTL,
  LEADERBOARD_TTL,
} from '../configs/enum';

@Injectable()
export class MarketAnalyticsService {
  private readonly logger = new Logger(MarketAnalyticsService.name);

  constructor(
    private readonly hyperliquidInfo: HyperliquidInfoService,
    private readonly redis: CacheService,
  ) {}

  /**
   * Returns all perpetuals sorted by 24h notional volume descending.
   * Serves from the cached market snapshot when available.
   */
  async getMarketOverview(): Promise<MarketDataDto[]> {
    const snapshot = await this.getMarketSnapshot();
    if (!snapshot) return [];
    return this.buildMarketData(snapshot.metas, snapshot.ctxs);
  }

  /**
   * Returns analytics for a single coin.
   */
  async getCoinStats(coin: string): Promise<MarketDataDto | null> {
    const markets = await this.getMarketOverview();
    return markets.find((m) => m.coin.toUpperCase() === coin.toUpperCase()) ?? null;
  }

  /**
   * Returns OHLCV candles for a coin.
   * Default: last 24h of 15-minute candles.
   */
  async getCoinCandles(
    coin: string,
    interval: CandleInterval = CandleInterval.FIFTEEN_MIN,
    startTime?: number,
    endTime?: number,
  ): Promise<CandleDto[]> {
    const start = startTime ?? Date.now() - 24 * 60 * 60 * 1000;
    return this.hyperliquidInfo.getCandleSnapshot(coin, interval, start, endTime);
  }

  /**
   * Returns the public leaderboard for the given time window.
   * Results are cached.
   */
  async getLeaderboard(
    window: LeaderboardWindow = LeaderboardWindow.DAY,
  ): Promise<LeaderboardEntryDto[]> {
    const cacheKey = `${REDIS_KEY.LEADERBOARD}:${window}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }

    const startTime = this.leaderboardWindowToStartTime(window);
    const entries = await this.hyperliquidInfo.getLeaderboard(startTime);
    if (entries?.length) {
      await this.redis.set(cacheKey, JSON.stringify(entries), LEADERBOARD_TTL);
    }
    return entries ?? [];
  }

  private leaderboardWindowToStartTime(window: LeaderboardWindow): number {
    const now = Date.now();
    switch (window) {
      case LeaderboardWindow.DAY:
        return now - 24 * 60 * 60 * 1000;
      case LeaderboardWindow.WEEK:
        return now - 7 * 24 * 60 * 60 * 1000;
      case LeaderboardWindow.MONTH:
        return now - 30 * 24 * 60 * 60 * 1000;
      case LeaderboardWindow.ALL_TIME:
      default:
        return 0;
    }
  }

  /**
   * Returns current mid prices for all coins.
   */
  async getAllMids(): Promise<Record<string, string>> {
    return this.hyperliquidInfo.getAllMids();
  }

  /**
   * Computes a quick summary sorted by volume / OI / funding for a given metric.
   */
  async getTopCoins(
    sortBy: 'volume' | 'openInterest' | 'fundingRate' = 'volume',
    limit = 20,
  ): Promise<MarketDataDto[]> {
    const markets = await this.getMarketOverview();
    return markets
      .sort((a, b) => {
        switch (sortBy) {
          case 'openInterest':
            return (
              parseFloat(b.ctx.oiNtlVlm || '0') -
              parseFloat(a.ctx.oiNtlVlm || '0')
            );
          case 'fundingRate':
            return (
              Math.abs(parseFloat(b.ctx.funding || '0')) -
              Math.abs(parseFloat(a.ctx.funding || '0'))
            );
          default: // volume
            return (
              parseFloat(b.ctx.dayNtlVlm || '0') -
              parseFloat(a.ctx.dayNtlVlm || '0')
            );
        }
      })
      .slice(0, limit);
  }

  // ─── Snapshot management (called by DataCollectorService) ───────────────────

  async refreshMarketSnapshot(): Promise<MarketSnapshotDto | null> {
    const [metas, ctxs] = await this.hyperliquidInfo.getMetaAndAssetCtxs();
    if (!metas?.length) return null;

    const snapshot: MarketSnapshotDto = {
      timestamp: Date.now(),
      metas,
      ctxs,
    };
    await this.redis.set(
      REDIS_KEY.MARKET_SNAPSHOT,
      JSON.stringify(snapshot),
      MARKET_SNAPSHOT_TTL,
    );
    return snapshot;
  }

  async getMarketSnapshot(): Promise<MarketSnapshotDto | null> {
    const cached = await this.redis.get(REDIS_KEY.MARKET_SNAPSHOT);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
    return this.refreshMarketSnapshot();
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private buildMarketData(
    metas: any[],
    ctxs: any[],
  ): MarketDataDto[] {
    return metas
      .map((meta, i) => {
        const ctx = ctxs[i] ?? {};
        const markPx = parseFloat(ctx.markPx || '0');
        const prevDayPx = parseFloat(ctx.prevDayPx || '0');
        const priceChange24h = markPx - prevDayPx;
        const priceChangePct24h =
          prevDayPx > 0 ? (priceChange24h / prevDayPx) * 100 : 0;
        return {
          coin: meta.name,
          meta,
          ctx,
          priceChange24h,
          priceChangePct24h,
        };
      })
      .sort(
        (a, b) =>
          parseFloat(b.ctx.dayNtlVlm || '0') -
          parseFloat(a.ctx.dayNtlVlm || '0'),
      );
  }
}