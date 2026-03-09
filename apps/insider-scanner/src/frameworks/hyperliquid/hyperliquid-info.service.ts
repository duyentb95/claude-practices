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
  isDelisted?: boolean;   // true for pairs removed from trading (filter before subscribing)
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
    type: string;         // 'deposit' | 'withdraw' | 'send' | 'internalTransfer' | 'subAccountTransfer' | 'rewardsClaim' | ...
    usdc?: string;        // amount for 'deposit' type
    amount?: string;      // amount for 'send' type
    usdcValue?: string;   // USD value for 'send' type
    token?: string;       // token symbol for 'send' type (e.g. 'USDC')
    user?: string;        // sender address for 'send' type
    nonce?: number;
    fee?: number;
    toPerp?: boolean;
    destination?: string; // recipient address for transfers
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
   * Fetch all perpetuals metadata including HIP-3 pairs.
   * Use this instead of getMetaAndAssetCtxs() when you only need coin names/metadata.
   * Filters out delisted pairs (isDelisted: true) by default.
   */
  async getAllPerpMetas(includeDelisted = false): Promise<PerpMetaDto[]> {
    const raw = await this.postInfo<any>({ type: 'allPerpMetas' }, null);
    if (!raw) return [];
    const universe: PerpMetaDto[] = Array.isArray(raw) ? raw : (raw?.universe ?? []);
    return includeDelisted ? universe : universe.filter((m) => !m.isDelisted);
  }

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
   * Fetch up to maxFills most recent fills by paginating backwards through time.
   * Uses aggregateByTime=true so each record represents one order (not a raw fill).
   * Hyperliquid caps each page at 2000 records and exposes at most the 10 000
   * most recent fills total — so 5 pages × 2000 = 10 000 max.
   * A 300 ms pause is inserted between pages to stay within rate limits.
   */
  async getUserFillsPaginated(
    address: string,
    maxFills = 10_000,
  ): Promise<HyperFillDto[]> {
    const PAGE_SIZE = 2_000;
    const all: HyperFillDto[] = [];
    let endTime = Date.now();

    while (all.length < maxFills) {
      const page = await this.postInfo<HyperFillDto[]>(
        {
          type: 'userFillsByTime',
          user: address,
          startTime: 0,
          endTime,
          aggregateByTime: true,
        },
        [],
      );

      if (!page || page.length === 0) break;

      all.push(...page);

      if (page.length < PAGE_SIZE) break; // last page — no more data available

      // Paginate to older fills: set endTime just before the earliest fill in this page
      const minTime = Math.min(...page.map((f) => f.time));
      endTime = minTime - 1;
      if (endTime <= 0) break;

      await new Promise((r) => setTimeout(r, 300));
    }

    return all.slice(0, maxFills);
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
   * Fetch user fee tier from Hyperliquid native API.
   * userAddRate <= 0 → trader is in a maker-rebate tier (market maker / HFT).
   */
  async getUserFees(address: string): Promise<UserFeesDto | null> {
    return this.postInfo<UserFeesDto | null>({ type: 'userFees', user: address }, null);
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
