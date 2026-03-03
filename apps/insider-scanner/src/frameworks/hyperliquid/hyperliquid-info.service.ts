import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { catchError, lastValueFrom, of } from 'rxjs';
import { hyperApiUrl } from '../../configs';
import { AsyncUtil } from '../../helpers';

export interface PerpMetaDto {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface AssetCtxDto {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  midPx: string;
}

export interface HyperFillDto {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}

export interface ClearinghouseStateDto {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: any[];
}

export interface LedgerUpdateDto {
  time: number;
  hash: string;
  delta: {
    type: string;         // 'deposit' | 'withdraw' | 'internalTransfer' | 'subAccountTransfer' | 'rewardsClaim' | ...
    usdc?: string;        // amount as string
    nonce?: number;
    fee?: number;
    toPerp?: boolean;
    destination?: string; // for transfers
  };
}

export interface UserFeesDto {
  userCrossRate: string;  // taker fee rate as string, e.g. "0.0003"
  userAddRate: string;    // maker fee rate as string; negative = maker rebate (MM tier)
}

@Injectable()
export class HyperliquidInfoService {
  private readonly logger = new Logger(HyperliquidInfoService.name);
  private readonly API_URL = hyperApiUrl;
  private readonly DEFAULT_TIMEOUT = 15_000;

  constructor(private readonly httpService: HttpService) {}

  /**
   * Fetch perpetuals metadata + live market context.
   * Returns [metas[], ctxs[]] where indices are aligned.
   */
  async getMetaAndAssetCtxs(): Promise<[PerpMetaDto[], AssetCtxDto[]]> {
    const raw = await this.postInfo<any>({ type: 'metaAndAssetCtxs' }, null);
    if (!raw || !Array.isArray(raw) || raw.length < 2) return [[], []];
    // Hyperliquid returns raw[0] as {universe: [...]} object, raw[1] as array of contexts
    const rawMeta = raw[0];
    const metas: PerpMetaDto[] = Array.isArray(rawMeta)
      ? rawMeta
      : (rawMeta?.universe ?? []);
    const ctxs: AssetCtxDto[] = raw[1] as AssetCtxDto[];
    return [metas, ctxs];
  }

  /**
   * Fetch fills for an address. Without time range returns all-time fills.
   * With startTime uses userFillsByTime for efficiency.
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
   * Fetch current account state: margin summary, positions, withdrawable.
   */
  async getClearinghouseState(
    address: string,
  ): Promise<ClearinghouseStateDto | null> {
    return this.postInfo<ClearinghouseStateDto>(
      { type: 'clearinghouseState', user: address },
      null,
    );
  }

  /**
   * Fetch non-funding ledger updates for an address (deposits, withdrawals, transfers).
   * Without startTime returns the most recent records.
   * Key for detecting fresh-deposit pattern: deposit → immediate large trade.
   */
  async getUserNonFundingLedger(address: string): Promise<LedgerUpdateDto[]> {
    return this.postInfo<LedgerUpdateDto[]>(
      { type: 'userNonFundingLedgerUpdates', user: address },
      [],
    );
  }

  /**
   * Fetch user fee tier from Copin API.
   * userAddRate <= 0 → trader is in a maker-rebate tier (market maker / HFT).
   * Uses a different base URL: https://hyper.copin.io/info
   */
  async getUserFees(address: string): Promise<UserFeesDto | null> {
    const COPIN_URL = 'https://hyper.copin.io/info';
    const response = await AsyncUtil.wrapPromise(
      lastValueFrom(
        this.httpService
          .post(
            COPIN_URL,
            { type: 'userFees', user: address },
            {
              timeout: this.DEFAULT_TIMEOUT,
              headers: { 'content-type': 'application/json', origin: 'https://app.copin.io' },
            },
          )
          .pipe(
            catchError((e) => {
              this.logger.warn(`Copin userFees error [${address.slice(0, 10)}]: ${e.message}`);
              return of(null);
            }),
          ),
      ),
      this.DEFAULT_TIMEOUT + 2000,
      null,
    );

    if (!response || response.status < 200 || response.status >= 300) return null;
    return response.data ?? null;
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
