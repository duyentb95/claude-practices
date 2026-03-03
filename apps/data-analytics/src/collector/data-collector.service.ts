import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketAnalyticsService } from '../analytics/market-analytics.service';
import { HyperliquidInfoService } from '../frameworks/hyperliquid/hyperliquid-info.service';
import { CronjobGuard, SafeFunctionGuard } from '../decorator';

/**
 * DataCollectorService runs periodic background jobs to keep the Redis
 * cache warm with fresh market data. All methods are guarded to prevent
 * re-entrant runs and to swallow errors without crashing the process.
 */
@Injectable()
export class DataCollectorService implements OnModuleInit {
  private readonly logger = new Logger(DataCollectorService.name);

  constructor(
    private readonly marketAnalytics: MarketAnalyticsService,
    private readonly hyperliquidInfo: HyperliquidInfoService,
  ) {}

  onModuleInit() {
    // Warm up market data immediately on startup without blocking
    setTimeout(() => this.collectMarketSnapshot(), 0);
  }

  /**
   * Refresh market snapshot every minute.
   * Stores metaAndAssetCtxs (funding, OI, volumes, prices) in Redis.
   */
  @Cron('0 * * * * *') // every minute
  @CronjobGuard()
  @SafeFunctionGuard()
  async collectMarketSnapshot() {
    this.logger.debug('Collecting market snapshot...');
    const snapshot = await this.marketAnalytics.refreshMarketSnapshot();
    if (snapshot) {
      this.logger.debug(
        `Market snapshot updated: ${snapshot.metas.length} coins`,
      );
    }
  }

  /**
   * Refresh leaderboards every 5 minutes.
   */
  @Cron('0 */5 * * * *') // every 5 minutes
  @CronjobGuard()
  @SafeFunctionGuard()
  async collectLeaderboards() {
    this.logger.debug('Collecting leaderboards...');
    const { LeaderboardWindow } = await import('../configs/enum');
    await Promise.all([
      this.marketAnalytics.getLeaderboard(LeaderboardWindow.DAY),
      this.marketAnalytics.getLeaderboard(LeaderboardWindow.WEEK),
    ]);
    this.logger.debug('Leaderboards updated');
  }
}