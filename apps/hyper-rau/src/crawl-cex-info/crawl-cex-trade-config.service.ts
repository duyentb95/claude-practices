import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CacheService } from '../frameworks/cache-service/cache.service';
import { CronjobGuard, SafeFunctionGuard } from '../decorator';
import { EXCHANGE, REDIS_KEY } from '../configs/enum';

@Injectable()
export class CrawlCexTradeConfigService {
  constructor(
    private readonly httpService: HttpService,
    private readonly redis: CacheService,
  ) {
    setTimeout(async () => {
      await this.crawlCexTradeConfig();
    }, 0);
  }

  @Cron('0 0 * * * *') // every hour
  @CronjobGuard()
  async crawlCexTradeConfig() {
    await Promise.all([
      this.getBybitPairConfig(),
      this.getBinancePairConfig(),
      this.getOkxPairConfig(),
      this.getBingXPairConfig(),
      this.getGatePairConfig(),
      this.getBitgetPairConfig(),
      //   this.getCoinexPairConfig(),
      this.getHyperliquidPairConfig(),
      //   this.getApexPairConfig(),
      this.getLighterPairConfig(),
    ]);
  }

  @SafeFunctionGuard()
  async getBybitPairConfig() {
    const response = await this.httpService
      .get('https://api.bybit.com/v5/market/instruments-info?category=linear')
      .toPromise();

    const pairs = response.data.result.list;
    const pairConfig = {};

    for (const pair of pairs) {
      if (`${pair.baseCoin}${pair.quoteCoin}` !== pair.symbol) {
        continue;
      }
      pairConfig[`${pair.baseCoin}-USDT`] = {
        sizeRounded: this.getDecimalPlaces(pair.lotSizeFilter.minOrderQty),
        priceRounded: this.getDecimalPlaces(pair.priceFilter.minPrice),
        maxLeverage: parseFloat(pair.leverageFilter.maxLeverage),
      };
    }

    await this.savePairConfig(EXCHANGE.BYBIT, pairConfig);
  }

  @SafeFunctionGuard()
  async getBinancePairConfig() {
    const response = await this.httpService
      .get('https://fapi.binance.com/fapi/v1/exchangeInfo')
      .toPromise();

    const pairs = response.data.symbols;
    const pairConfig = {};

    for (const pair of pairs) {
      if (pair.quoteAsset !== 'USDT') {
        continue;
      }

      pairConfig[`${pair.baseAsset}-USDT`] = {
        sizeRounded: pair.quantityPrecision,
        priceRounded: pair.pricePrecision,
      };
    }

    await this.savePairConfig(EXCHANGE.BINANCE, pairConfig);
  }

  @SafeFunctionGuard()
  async getOkxPairConfig() {
    const response = await this.httpService
      .get('https://www.okx.com/api/v5/public/instruments?instType=SWAP')
      .toPromise();

    const pairs = response.data.data;
    const pairConfig = {};

    for (const pair of pairs) {
      if (pair.settleCcy !== 'USDT') {
        continue;
      }

      pairConfig[pair.instFamily] = {
        sizeRounded: this.getDecimalPlaces(pair.ctVal),
        priceRounded: this.getDecimalPlaces(pair.tickSz),
        lotSize: parseFloat(pair.ctVal),
        maxLeverage: parseFloat(pair.lever),
      };
    }

    await this.savePairConfig(EXCHANGE.OKX, pairConfig);
  }

  @SafeFunctionGuard()
  async getBingXPairConfig() {
    const response = await this.httpService
      .get('https://open-api.bingx.com/openApi/swap/v2/quote/contracts')
      .toPromise();

    const pairs = response.data.data;
    const pairConfig = {};

    for (const pair of pairs) {
      if (pair.currency !== 'USDT') {
        continue;
      }

      pairConfig[pair.symbol] = {
        sizeRounded: pair.quantityPrecision,
        priceRounded: pair.pricePrecision,
        maxLeverage: pair.maxLongLeverage,
      };
    }

    await this.savePairConfig(EXCHANGE.BINGX, pairConfig);
  }

  @SafeFunctionGuard()
  async getGatePairConfig() {
    const response = await this.httpService
      .get('https://api.gateio.ws/api/v4/futures/usdt/contracts')
      .toPromise();

    const pairs = response.data;
    const pairConfig = {};

    for (const pair of pairs) {
      pairConfig[pair.name.replace('_', '-')] = {
        sizeRounded: this.getDecimalPlaces(pair.quanto_multiplier),
        priceRounded: this.getDecimalPlaces(pair.mark_price_round),
        stepPrice: parseFloat(pair.mark_price_round),
        lotSize: parseFloat(pair.quanto_multiplier),
        maxLeverage: parseFloat(pair.leverage_max),
      };
    }

    await this.savePairConfig(EXCHANGE.GATE, pairConfig);
  }

  @SafeFunctionGuard()
  async getBitgetPairConfig() {
    const response = await this.httpService
      .get(
        'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES',
      )
      .toPromise();

    const pairs = response.data.data;
    const pairConfig = {};

    for (const pair of pairs) {
      pairConfig[`${pair.baseCoin}-USDT`] = {
        sizeRounded: this.getDecimalPlaces(pair.minTradeNum),
        priceRounded: parseFloat(pair.pricePlace),
        maxLeverage: parseFloat(pair.maxLever),
      };
    }

    await this.savePairConfig(EXCHANGE.BITGET, pairConfig);
  }

  //   @SafeFunctionGuard()
  //   async getCoinexPairConfig() {
  //     const response = await this.httpService
  //       .get('https://api.coinex.com/v2/futures/market')
  //       .toPromise();

  //     const pairs = response.data.data;
  //     const pairConfig = {};

  //     for (const pair of pairs) {
  //       if (pair.quote_ccy !== 'USDT') {
  //         continue;
  //       }

  //       pairConfig[`${pair.base_ccy}-USDT`] = {
  //         sizeRounded: parseFloat(pair.base_ccy_precision),
  //         priceRounded: this.getDecimalPlaces(pair.tick_size),
  //         maxLeverage: parseFloat(pair.leverage[pair.leverage.length - 1]),
  //       };
  //     }

  //     await this.savePairConfig(EXCHANGE.COINEX, pairConfig);
  //   }

  @SafeFunctionGuard()
  async getHyperliquidPairConfig() {
    const response = await this.httpService
      .post('https://api.hyperliquid.xyz/info', {
        type: 'allPerpMetas',
      })
      .toPromise();

    const pairConfig = {};
    response.data.forEach((v, perpIndex) => {
      const pairs = v.universe;

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        pairConfig[`${pair.name}-USDT`] = {
          index: perpIndex === 0 ? i : 100000 + i + perpIndex * 10000,
          szDecimals: pair.szDecimals,
          maxLeverage: pair.maxLeverage,
        };
      }
    });

    await this.savePairConfig(EXCHANGE.HYPERLIQUID, pairConfig);
  }

  //   @SafeFunctionGuard()
  //   async getApexPairConfig() {
  //     const response = await this.httpService
  //       .get('https://omni.apex.exchange/api/v3/symbols')
  //       .toPromise();

  //     const pairs = response.data.data.contractConfig.perpetualContract;
  //     const pairConfig = {};

  //     for (const pair of pairs) {
  //       if (pair.settleAssetId !== 'USDT') {
  //         continue;
  //       }

  //       pairConfig[pair.symbol] = {
  //         sizeRounded: this.getDecimalPlaces(pair.stepSize),
  //         priceRounded: this.getDecimalPlaces(pair.tickSize),
  //         maxLeverage: parseFloat(pair.displayMaxLeverage),
  //         lotSize: parseFloat(pair.stepSize),
  //       };
  //     }

  //     await this.savePairConfig(EXCHANGE.APEX, pairConfig);
  //   }

  @SafeFunctionGuard()
  async getLighterPairConfig() {
    const response = await this.httpService
      .get('https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails')
      .toPromise();

    const pairs = response.data.order_book_details;
    const pairConfig = {};

    for (const pair of pairs) {
      pairConfig[`${pair.symbol}-USDT`] = {
        marketId: pair.market_id,
        sizeDecimals: pair.size_decimals,
        priceDecimals: pair.price_decimals,
      };
    }
    await this.savePairConfig(EXCHANGE.LIGHTER, pairConfig);
  }

  async savePairConfig(exchange: EXCHANGE, newPairConfig: any) {
    const redisKey = `${REDIS_KEY.PAIRS_BY_EXCHANGE}_${exchange}`;
    await this.redis.hmSet(redisKey, newPairConfig);
  }

  // @SafeFunctionGuard()
  // async sendBotMessage(message: string) {
  //     const body = {
  //         msg_type: 'text',
  //         content: {
  //             text: message,
  //         },
  //     }
  //     try {
  //         await this.httpService
  //             .post(larkWebhookNewPairAlert, body)
  //             .toPromise()
  //     } catch (error) {
  //         SentryService.captureException(error, 'cex-trade-config-alert')
  //     }
  // }

  getDecimalPlaces(number: string) {
    // Remove trailing zeros after decimal
    const trimmed = number.replace(/\.?0+$/, '');

    // Find decimal point position
    const dotIndex = trimmed.indexOf('.');

    // If no decimal point or it's the last character, return 0
    if (dotIndex === -1 || dotIndex === trimmed.length - 1) {
      return 0;
    }

    // Return length of decimal part
    return trimmed.length - dotIndex - 1;
  }
}
