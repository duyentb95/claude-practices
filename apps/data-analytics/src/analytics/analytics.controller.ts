import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { TraderAnalyticsService } from './trader-analytics.service';
import { MarketAnalyticsService } from './market-analytics.service';
import { CandleInterval, LeaderboardWindow } from '../configs/enum';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly traderAnalytics: TraderAnalyticsService,
    private readonly marketAnalytics: MarketAnalyticsService,
  ) {}

  // ─── Trader Endpoints ────────────────────────────────────────────────────────

  /**
   * GET /analytics/trader/:address?days=30
   * Full performance stats for a trader over the given period.
   */
  @Get('trader/:address')
  async getTraderStats(
    @Param('address') address: string,
    @Query('days') days?: string,
  ) {
    const periodDays = this.parsePeriodDays(days, 30);
    return this.traderAnalytics.getTraderStats(address, periodDays);
  }

  /**
   * GET /analytics/trader/:address/positions
   * Current open positions and account margin summary.
   */
  @Get('trader/:address/positions')
  async getTraderPositions(@Param('address') address: string) {
    return this.traderAnalytics.getTraderPositions(address);
  }

  /**
   * GET /analytics/trader/:address/fills?startTime=&endTime=
   * Raw fill history with optional time range (epoch ms).
   */
  @Get('trader/:address/fills')
  async getTraderFills(
    @Param('address') address: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const start = startTime ? parseInt(startTime) : undefined;
    const end = endTime ? parseInt(endTime) : undefined;
    if (startTime && isNaN(start)) throw new BadRequestException('Invalid startTime');
    if (endTime && isNaN(end)) throw new BadRequestException('Invalid endTime');
    return this.traderAnalytics.getRawFills(address, start, end);
  }

  /**
   * GET /analytics/trader/:address/funding?startTime=&endTime=
   * Funding payment history for a trader.
   */
  @Get('trader/:address/funding')
  async getTraderFunding(
    @Param('address') address: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const start = startTime
      ? parseInt(startTime)
      : Date.now() - 30 * 24 * 60 * 60 * 1000;
    const end = endTime ? parseInt(endTime) : Date.now();
    return this.traderAnalytics.getRawFunding(address, start, end);
  }

  // ─── Market Endpoints ────────────────────────────────────────────────────────

  /**
   * GET /analytics/market
   * All perpetuals sorted by 24h volume.
   */
  @Get('market')
  async getMarketOverview() {
    return this.marketAnalytics.getMarketOverview();
  }

  /**
   * GET /analytics/market/top?sortBy=volume&limit=20
   * Top coins sorted by volume | openInterest | fundingRate.
   */
  @Get('market/top')
  async getTopCoins(
    @Query('sortBy') sortBy?: 'volume' | 'openInterest' | 'fundingRate',
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    return this.marketAnalytics.getTopCoins(sortBy ?? 'volume', parsedLimit);
  }

  /**
   * GET /analytics/market/mids
   * Current mid prices for all coins.
   */
  @Get('market/mids')
  async getAllMids() {
    return this.marketAnalytics.getAllMids();
  }

  /**
   * GET /analytics/market/:coin
   * Stats for a specific coin.
   */
  @Get('market/:coin')
  async getCoinStats(@Param('coin') coin: string) {
    const stats = await this.marketAnalytics.getCoinStats(coin);
    if (!stats) throw new BadRequestException(`Unknown coin: ${coin}`);
    return stats;
  }

  /**
   * GET /analytics/market/:coin/candles?interval=15m&startTime=&endTime=
   * OHLCV candle data.
   * interval: 1m | 5m | 15m | 1h | 4h | 1d
   */
  @Get('market/:coin/candles')
  async getCoinCandles(
    @Param('coin') coin: string,
    @Query('interval') interval?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const candleInterval = this.parseCandleInterval(interval);
    const start = startTime ? parseInt(startTime) : undefined;
    const end = endTime ? parseInt(endTime) : undefined;
    if (startTime && isNaN(start)) throw new BadRequestException('Invalid startTime');
    if (endTime && isNaN(end)) throw new BadRequestException('Invalid endTime');
    return this.marketAnalytics.getCoinCandles(coin, candleInterval, start, end);
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────────

  /**
   * GET /analytics/leaderboard?window=day
   * Public leaderboard. window: day | week | month | allTime
   */
  @Get('leaderboard')
  async getLeaderboard(@Query('window') window?: string) {
    const lbWindow = this.parseLeaderboardWindow(window);
    return this.marketAnalytics.getLeaderboard(lbWindow);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private parsePeriodDays(days: string | undefined, defaultDays: number): number {
    if (!days) return defaultDays;
    const n = parseInt(days);
    if (isNaN(n) || n < 1 || n > 365) {
      throw new BadRequestException('days must be between 1 and 365');
    }
    return n;
  }

  private parseCandleInterval(interval: string | undefined): CandleInterval {
    const valid = Object.values(CandleInterval) as string[];
    if (!interval) return CandleInterval.FIFTEEN_MIN;
    if (!valid.includes(interval)) {
      throw new BadRequestException(`interval must be one of: ${valid.join(', ')}`);
    }
    return interval as CandleInterval;
  }

  private parseLeaderboardWindow(window: string | undefined): LeaderboardWindow {
    const valid = Object.values(LeaderboardWindow) as string[];
    if (!window) return LeaderboardWindow.DAY;
    if (!valid.includes(window)) {
      throw new BadRequestException(`window must be one of: ${valid.join(', ')}`);
    }
    return window as LeaderboardWindow;
  }
}