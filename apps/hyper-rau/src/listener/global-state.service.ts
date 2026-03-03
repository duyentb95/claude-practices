import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { tag } from '../configs';
import { CacheService } from '../frameworks/cache-service/cache.service';
import { CronjobGuard } from '../decorator';
import { EXCHANGE, REDIS_KEY } from '../configs/enum';

export interface SOPConfig {
  isEnable: boolean;
  timeAutoClose: number;
  pairConfigs: PairConfig[];
  timeDelay: number;
}
export interface PairConfig {
  symbol: string;
  percent: number[];
  takeProfitPercent: number[];
  totalVolume: number;
  ratio: number[];
  isLong?: boolean;
  minTpPercent?: number;
}

export enum PostActionEnum {
  SETUP_ORDERS = 'setupOrders',
  MODIFY_ORDERS = 'modifyOrders',
  FRONTEND_OPEN_ORDERS = 'frontendOpenOrders',
  HISTORICAL_ORDERS = 'historicalOrders',
  PLACE_MISSING_ORDERS = 'place_missing_orders',
  CHECK_RATE_LIMIT = 'userRateLimit',
}
export type PostData = {
  [uniqueId: number]: { data: any; type: PostActionEnum };
};

@Injectable()
export class GlobalStateService {
  public hyperConfig = {};
  public config: SOPConfig | null = null;
  public uniqueId = 0;
  public isInitialized = false;
  public postData: PostData = {};

  constructor(private redis: CacheService) {
    setTimeout(
      async function () {
        await this.getConfig();
        await this.getHyperConfig();
      }.bind(this),
      0,
    );
  }

  @Interval(5000)
  @CronjobGuard()
  private async syncEveryFiveSecond() {
    await this.getHyperConfig();
  }

  async getHyperConfig() {
    this.hyperConfig = await this.redis.hGetAll(
      `${REDIS_KEY.PAIRS_BY_EXCHANGE}_${EXCHANGE.HYPERLIQUID}`,
      true,
    );
    return this.hyperConfig;
  }

  async getConfig(): Promise<SOPConfig> {
    this.config = await this.redis.hGet(REDIS_KEY.LISTENER_CONFIG, tag, true);
    return this.config;
  }

  clearStorageData() {
    this.uniqueId = 0;
    this.postData = {};
    this.isInitialized = false;
  }
}
