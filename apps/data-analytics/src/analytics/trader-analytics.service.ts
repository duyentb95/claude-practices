import { Injectable, Logger } from '@nestjs/common';
import { HyperliquidInfoService } from '../frameworks/hyperliquid/hyperliquid-info.service';
import { CacheService } from '../frameworks/cache-service/cache.service';
import { HyperFillDto, UserFundingDto } from '../dto/fill.dto';
import {
  TraderStatsDto,
  CoinStatsDto,
  AccountStateDto,
  PositionEntryDto,
} from '../dto/trader.dto';
import { REDIS_KEY, TRADER_STATS_TTL } from '../configs/enum';

@Injectable()
export class TraderAnalyticsService {
  private readonly logger = new Logger(TraderAnalyticsService.name);

  constructor(
    private readonly hyperliquidInfo: HyperliquidInfoService,
    private readonly redis: CacheService,
  ) {}

  /**
   * Compute full analytics for a trader over the specified period.
   * Results are cached in Redis for TRADER_STATS_TTL seconds.
   */
  async getTraderStats(
    address: string,
    periodDays = 30,
  ): Promise<TraderStatsDto> {
    const cacheKey = `${REDIS_KEY.TRADER_STATS}:${address.toLowerCase()}:${periodDays}d`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }

    const startTime = Date.now() - periodDays * 24 * 60 * 60 * 1000;

    const [fills, funding] = await Promise.all([
      this.hyperliquidInfo.getUserFills(address, startTime),
      this.hyperliquidInfo.getUserFunding(address, startTime),
    ]);

    const stats = this.computeStats(address, fills, funding, periodDays);
    await this.redis.set(cacheKey, JSON.stringify(stats), TRADER_STATS_TTL);
    return stats;
  }

  /**
   * Proxy to raw fills — used by the controller for direct fill queries.
   */
  async getRawFills(
    address: string,
    startTime?: number,
    endTime?: number,
  ): Promise<HyperFillDto[]> {
    return this.hyperliquidInfo.getUserFills(address, startTime, endTime);
  }

  /**
   * Proxy to raw funding — used by the controller for funding history queries.
   */
  async getRawFunding(
    address: string,
    startTime: number,
    endTime?: number,
  ): Promise<UserFundingDto[]> {
    return this.hyperliquidInfo.getUserFunding(address, startTime, endTime);
  }

  /**
   * Fetch current open positions + account margin summary.
   */
  async getTraderPositions(address: string): Promise<AccountStateDto> {
    const raw = await this.hyperliquidInfo.getClearinghouseState(address);
    return this.parseAccountState(address, raw);
  }

  // ─── Core Computation ────────────────────────────────────────────────────────

  computeStats(
    address: string,
    fills: HyperFillDto[],
    funding: UserFundingDto[],
    periodDays: number,
  ): TraderStatsDto {
    let realizedPnl = 0;
    let totalFees = 0;
    let totalVolume = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let longTrades = 0;
    let shortTrades = 0;
    let bestTrade = 0;
    let worstTrade = 0;

    const coinStatsMap = new Map<string, CoinStatsDto>();

    for (const fill of fills) {
      const pnl = parseFloat(fill.closedPnl) || 0;
      const fee = parseFloat(fill.fee) || 0;
      const price = parseFloat(fill.px) || 0;
      const size = parseFloat(fill.sz) || 0;
      const tradeVolume = price * size;

      totalFees += fee;
      totalVolume += tradeVolume;

      // Closing fills carry realized PnL
      const isClosingFill =
        fill.dir === 'Close Long' ||
        fill.dir === 'Close Short' ||
        fill.dir === 'Short > Long' ||
        fill.dir === 'Long > Short';

      if (isClosingFill) {
        realizedPnl += pnl;
        if (pnl > 0) winningTrades++;
        else if (pnl < 0) losingTrades++;

        if (pnl > bestTrade) bestTrade = pnl;
        if (pnl < worstTrade || worstTrade === 0) worstTrade = pnl;
      }

      // Long vs short direction
      if (
        fill.dir === 'Open Long' ||
        fill.dir === 'Close Short' ||
        fill.dir === 'Short > Long'
      ) {
        longTrades++;
      } else {
        shortTrades++;
      }

      // Per-coin accumulation
      if (!coinStatsMap.has(fill.coin)) {
        coinStatsMap.set(fill.coin, {
          coin: fill.coin,
          realizedPnl: 0,
          fees: 0,
          netPnl: 0,
          volume: 0,
          trades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          bestTrade: 0,
          worstTrade: 0,
        });
      }

      const cs = coinStatsMap.get(fill.coin);
      cs.fees += fee;
      cs.volume += tradeVolume;
      cs.trades++;

      if (isClosingFill) {
        cs.realizedPnl += pnl;
        if (pnl > 0) cs.winningTrades++;
        else if (pnl < 0) cs.losingTrades++;
        if (pnl > cs.bestTrade) cs.bestTrade = pnl;
        if (pnl < cs.worstTrade || cs.worstTrade === 0) cs.worstTrade = pnl;
      }
    }

    // Finalise per-coin stats
    for (const cs of coinStatsMap.values()) {
      cs.netPnl = cs.realizedPnl - cs.fees;
      const closedCount = cs.winningTrades + cs.losingTrades;
      cs.winRate = closedCount > 0 ? cs.winningTrades / closedCount : 0;
    }

    const fundingReceived = funding.reduce(
      (acc, f) => acc + (parseFloat(f.usdc) || 0),
      0,
    );
    const netPnl = realizedPnl + fundingReceived - totalFees;
    const totalTrades = fills.length;
    const closedCount = winningTrades + losingTrades;
    const winRate = closedCount > 0 ? winningTrades / closedCount : 0;
    const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;

    const coinStats = Array.from(coinStatsMap.values()).sort(
      (a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl),
    );

    return {
      address,
      computedAt: Date.now(),
      periodDays,
      realizedPnl,
      totalFees,
      fundingReceived,
      netPnl,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalVolume,
      avgTradeSize,
      bestTrade,
      worstTrade,
      longTrades,
      shortTrades,
      coinStats,
    };
  }

  // ─── Account State Parsing ────────────────────────────────────────────────────

  private parseAccountState(address: string, raw: any): AccountStateDto {
    if (!raw) {
      return {
        address,
        accountValue: '0',
        totalNtlPos: '0',
        withdrawable: '0',
        crossMarginSummary: {
          accountValue: '0',
          totalNtlPos: '0',
          totalRawUsd: '0',
          totalMarginUsed: '0',
        },
        marginSummary: {
          accountValue: '0',
          totalNtlPos: '0',
          totalRawUsd: '0',
          totalMarginUsed: '0',
        },
        positions: [],
      };
    }

    const positions: PositionEntryDto[] = (raw.assetPositions ?? [])
      .filter((ap: any) => parseFloat(ap.position?.szi || '0') !== 0)
      .map((ap: any) => {
        const p = ap.position;
        return {
          coin: p.coin,
          szi: p.szi,
          entryPx: p.entryPx,
          positionValue: p.positionValue,
          unrealizedPnl: p.unrealizedPnl,
          returnOnEquity: p.returnOnEquity,
          liquidationPx: p.liquidationPx,
          marginUsed: p.marginUsed,
          leverage: p.leverage,
          cumFunding: p.cumFunding,
          maxLeverage: p.maxLeverage,
        };
      });

    return {
      address,
      accountValue: raw.marginSummary?.accountValue ?? '0',
      totalNtlPos: raw.marginSummary?.totalNtlPos ?? '0',
      withdrawable: raw.withdrawable ?? '0',
      crossMarginSummary: raw.crossMarginSummary ?? {},
      marginSummary: raw.marginSummary ?? {},
      positions,
    };
  }
}