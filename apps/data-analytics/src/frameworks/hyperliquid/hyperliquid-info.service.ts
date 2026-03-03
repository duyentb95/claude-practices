import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { catchError, lastValueFrom, of } from 'rxjs';
import { hyperApiUrl } from '../../configs';
import { AsyncUtil } from '../../helpers';
import { HyperFillDto, UserFundingDto, CandleDto } from '../../dto/fill.dto';
import {
  PerpMetaDto,
  AssetCtxDto,
  LeaderboardEntryDto,
} from '../../dto/market.dto';
import { CandleInterval } from '../../configs/enum';

@Injectable()
export class HyperliquidInfoService {
  private readonly logger = new Logger(HyperliquidInfoService.name);
  private readonly API_URL = hyperApiUrl;
  private readonly DEFAULT_TIMEOUT = 15_000;

  constructor(private readonly httpService: HttpService) {}

  // ─── Trader Data ────────────────────────────────────────────────────────────

  /**
   * Fetch all fills for a trader. When startTime/endTime are provided,
   * uses userFillsByTime which supports pagination for large histories.
   */
  async getUserFills(
    address: string,
    startTime?: number,
    endTime?: number,
  ): Promise<HyperFillDto[]> {
    const body =
      startTime != null
        ? {
            type: 'userFillsByTime',
            user: address,
            startTime,
            endTime: endTime ?? Date.now(),
            aggregateByTime: false,
          }
        : { type: 'userFills', user: address };

    return this.postInfo<HyperFillDto[]>(body, []);
  }

  /**
   * Fetch funding payment history for a trader in a time range.
   */
  async getUserFunding(
    address: string,
    startTime: number,
    endTime?: number,
  ): Promise<UserFundingDto[]> {
    return this.postInfo<UserFundingDto[]>(
      {
        type: 'userFunding',
        user: address,
        startTime,
        endTime: endTime ?? Date.now(),
      },
      [],
    );
  }

  /**
   * Fetch current account state: margin summary, positions, withdrawable balance.
   */
  async getClearinghouseState(address: string): Promise<any> {
    return this.postInfo<any>({ type: 'clearinghouseState', user: address }, null);
  }

  /**
   * Fetch open orders for a trader.
   */
  async getOpenOrders(address: string): Promise<any[]> {
    return this.postInfo<any[]>(
      { type: 'openOrders', user: address, dex: 'ALL_DEXS' },
      [],
    );
  }

  /**
   * Fetch historical orders for a trader.
   */
  async getHistoricalOrders(address: string): Promise<any[]> {
    return this.postInfo<any[]>(
      { type: 'historicalOrders', user: address },
      [],
    );
  }

  /**
   * Fetch the trader's portfolio equity curve.
   * Returns [[timestamp, {pnl, accountValue}], ...].
   */
  async getPortfolioSnapshot(address: string): Promise<any[]> {
    return this.postInfo<any[]>(
      { type: 'portfolioSnapshot', user: address },
      [],
    );
  }

  // ─── Market Data ─────────────────────────────────────────────────────────────

  /**
   * Fetch perpetuals metadata + live market context (funding, OI, volume, prices).
   * Returns [metas[], ctxs[]] where indices are aligned.
   */
  async getMetaAndAssetCtxs(): Promise<[PerpMetaDto[], AssetCtxDto[]]> {
    const raw = await this.postInfo<[[PerpMetaDto[]], [AssetCtxDto[]]]>(
      { type: 'metaAndAssetCtxs' },
      null,
    );

    if (!raw || !Array.isArray(raw) || raw.length < 2) {
      return [[], []];
    }

    // Response shape: [[meta0, meta1, ...], [ctx0, ctx1, ...]]
    const metas: PerpMetaDto[] = raw[0] as any;
    const ctxs: AssetCtxDto[] = raw[1] as any;
    return [metas, ctxs];
  }

  /**
   * Fetch all perpetuals metadata only.
   * Returns the full allPerpMetas response which has multiple universe groups.
   */
  async getAllPerpMetas(): Promise<any[]> {
    return this.postInfo<any[]>({ type: 'allPerpMetas' }, []);
  }

  /**
   * Fetch current mid prices for all coins.
   * Returns { coin: midPriceString }.
   */
  async getAllMids(): Promise<Record<string, string>> {
    return this.postInfo<Record<string, string>>({ type: 'allMids' }, {});
  }

  /**
   * Fetch OHLCV candle data for a coin.
   */
  async getCandleSnapshot(
    coin: string,
    interval: CandleInterval,
    startTime: number,
    endTime?: number,
  ): Promise<CandleDto[]> {
    return this.postInfo<CandleDto[]>(
      {
        type: 'candleSnapshot',
        req: {
          coin,
          interval,
          startTime,
          endTime: endTime ?? Date.now(),
        },
      },
      [],
    );
  }

  /**
   * Fetch the public leaderboard.
   * startTime: epoch ms for window start (0 = all time)
   */
  async getLeaderboard(startTime: number): Promise<LeaderboardEntryDto[]> {
    const raw = await this.postInfo<any>(
      { type: 'leaderboard', startTime },
      null,
    );
    // Leaderboard response: { leaderboardRows: [...] }
    return raw?.leaderboardRows ?? [];
  }

  /**
   * Fetch L2 order book for a coin.
   */
  async getL2Book(coin: string, nSigFigs?: number): Promise<any> {
    const body: any = { type: 'l2Book', coin };
    if (nSigFigs != null) body.nSigFigs = nSigFigs;
    return this.postInfo<any>(body, null);
  }

  /**
   * Fetch spot meta and asset contexts.
   */
  async getSpotMetaAndAssetCtxs(): Promise<any> {
    return this.postInfo<any>({ type: 'spotMetaAndAssetCtxs' }, null);
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private async postInfo<T>(body: Record<string, any>, fallback: T): Promise<T> {
    const response = await AsyncUtil.wrapPromise(
      lastValueFrom(
        this.httpService
          .post(`${this.API_URL}/info`, body, {
            timeout: this.DEFAULT_TIMEOUT,
          })
          .pipe(
            catchError((e) => {
              this.logger.error(
                `Hyperliquid info error [${body.type}]: ${e.message}`,
              );
              return of(e.response ?? null);
            }),
          ),
      ),
      this.DEFAULT_TIMEOUT + 2000,
      null,
    );

    if (!response || response.status < 200 || response.status >= 300) {
      return fallback;
    }

    return response.data ?? fallback;
  }
}