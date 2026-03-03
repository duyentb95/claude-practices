import { Injectable } from '@nestjs/common';
import {
  GlobalStateService,
  PairConfig,
  PostActionEnum,
} from './global-state.service';
import { PlaceOrderService } from './place-order.service';
import { OrderDto, WsPlaceOrderData } from '../dto/order.dto';
import { HyperliquidSdkService } from '../frameworks/hyperliquid/hyperliquid-sdk.service';
import { WebSocket } from 'ws';
import { PositionDto } from '../dto/position.dto';
import { CandleData, HyperUserFillDto } from '../dto/fill.dto';
import { Interval } from '@nestjs/schedule';
import { CronjobGuard } from '../decorator';
import { ConvertUtils, TimeUtil } from '../helpers';

type OrderPlaced = {
  key: string;
  symbol: string;
  oid: number | null;
  lastPrice: number;
  lastUpdatedAt: number;
  needCheckWhenPriceUp: boolean;
  needCheckWhenPriceDown: boolean;
  data: WsPlaceOrderData;
  tpPercent: number;
};

type OrderToModify = {
  key: string;
  symbol: string;
  currentPrice: number;
  data: { oid: number; order: WsPlaceOrderData };
  pairConfig: PairConfig;
  lastOrder: WsPlaceOrderData;
  tpPercent: number;
};

@Injectable()
export class OrderManagementService {
  private START_TIME = Date.now();
  private PERCENT_TO_CHANGE = 10;
  private forceStop = false;
  private listOrderPlaced: { [key: string]: OrderPlaced } = {};
  private isInitialized = false;
  private userFills: { [symbol: string]: HyperUserFillDto[] } = {};
  private isSettingUp = false;
  private positionStatus: {
    [symbol: string]: {
      hasTpOrder: boolean;
      timeStamp: number;
      tpOrderId: number | null;
    };
  } = {};
  private openingPositions: PositionDto[] = [];
  private openOrders: OrderDto[] = [];
  private prices: {
    [symbol: string]: { symbol: string; minPrice: string; maxPrice: string };
  } = {};
  private socket: WebSocket;
  private latestCandle: { [symbol: string]: CandleData } = {};

  constructor(
    private readonly hyperliquidSdk: HyperliquidSdkService,
    private readonly globalState: GlobalStateService,
    private readonly placeOrderService: PlaceOrderService,
  ) {
    setTimeout(
      async function () {
        // this.setupMarginMode();
        await this.placeOrderService.cancelOrdersHTTP();
      }.bind(this),
      0,
    );
  }
  setSocket(socket: WebSocket) {
    this.socket = socket;
  }
  clearStorageData() {
    this.listOrderPlaced = {};
    this.userFills = {};
    this.positionStatus = {};
    this.isInitialized = false;
    this.isSettingUp = false;
  }

  @Interval(60_000)
  @CronjobGuard()
  async checkRateLimit() {
    const data = await this.hyperliquidSdk.getUserRateLimit(
      this.placeOrderService.apiKey.apiKey,
    );
    if ((data?.nRequestsUsed || 0) > 0.8 * (data?.nRequestsCap || 0)) {
      console.log('Force stop by rate limit');
      this.forceStop = true;
      this.clearStorageData();
      await this.placeOrderService.cancelOrdersHTTP();
    }
  }

  @Interval(1_000)
  @CronjobGuard()
  async checkConfig() {
    const prevConfig = { ...this.globalState.config };
    const newConfig = { ...(await this.globalState.getConfig()) };
    if (prevConfig.isEnable !== newConfig.isEnable) {
      if (newConfig.isEnable) {
        this.forceStop = false;
      } else {
        this.forceStop = true;
        this.clearStorageData();
        await this.placeOrderService.cancelOrdersHTTP();
      }
    }
  }

  @Interval(1_000)
  @CronjobGuard()
  async syncEverySecond() {
    if (!this.isInitialized) return;
    this.checkOpenPositions({ positions: [...this.openingPositions] });
    this.checkOpenOrders();
  }

  syncUserFills(response: any) {
    if (!response?.data || !this.globalState.isInitialized || this.forceStop) {
      return;
    }
    let fillsNeedToProcess: HyperUserFillDto[] = [];
    if (response?.data?.isSnapshot) {
      return;
    } else {
      fillsNeedToProcess = response.data.fills;
    }
    if (fillsNeedToProcess.length) {
      fillsNeedToProcess.forEach((fill: HyperUserFillDto) => {
        if (!this.userFills[fill.coin]) {
          this.userFills[fill.coin] = [];
        }
        this.userFills[fill.coin].push(fill);
      });
    }
  }

  async syncPrices({
    symbol,
    minPrice,
    maxPrice,
  }: {
    symbol: string;
    minPrice: string;
    maxPrice: string;
  }) {
    this.prices = { ...this.prices, [symbol]: { symbol, minPrice, maxPrice } };
  }

  async syncActionType(uniqueId: number, response: any) {
    if (this.forceStop) return;
    uniqueId;
    response;
  }

  @Interval(500)
  @CronjobGuard()
  async sync() {
    if (this.forceStop || !this.globalState.isInitialized) return;
    if (!this.isInitialized) {
      if (this.isSettingUp) return;
      this.isSettingUp = true;
      await this.placeOrderService.cancelOrdersHTTP();
      await this.listenPriceAndSetupOrders({
        price: this.prices,
        type: PostActionEnum.SETUP_ORDERS,
      });
    } else {
      await this.listenPriceAndModifyOrder({
        price: this.prices,
      });
    }
  }

  async checkOpenOrders() {
    if (
      !this.globalState.config.isEnable ||
      !this.globalState.isInitialized ||
      this.forceStop ||
      !this.isInitialized
    )
      return;
    {
      // check open order, if not in mapping => cancel
      const orders = [...this.openOrders];
      const cancelOrders: { orderId: number; assetId: number }[] = [];
      const orderPlacedMapping = Object.values(this.listOrderPlaced)
        .map((v) => {
          return v.oid;
        })
        .filter((v) => !!v)
        .reduce(
          (r, v) => {
            return { ...r, [v]: v };
          },
          {} as { [oid: number]: number },
        );
      const tpOrderMapping = Object.values(this.positionStatus)
        .map((v) => v.tpOrderId)
        .filter((v) => !!v)
        .reduce(
          (r, v) => {
            return { ...r, [v]: v };
          },
          {} as { [oid: number]: number },
        );
      for (const order of orders) {
        if (Date.now() - order.timestamp < 2_000) continue;
        const orderId = order.oid;
        if (!orderPlacedMapping[orderId] && !tpOrderMapping[orderId]) {
          const pair = order.coin + '-USDT';
          const pairConfig = this.globalState.hyperConfig[pair];
          cancelOrders.push({ orderId, assetId: pairConfig.index });
        }
      }
      if (cancelOrders.length) {
        await this.hyperliquidSdk.cancelBulkOrder(
          cancelOrders,
          this.placeOrderService.apiKey,
        );
      }
    }

    {
      const openOrders = [...this.openOrders].filter(
        (v) => !this.positionStatus[v.coin],
      );
      const openOrderMapping: Record<number, OrderDto> = {};
      openOrders.forEach((order) => {
        if (order.oid) {
          openOrderMapping[order.oid] = order;
        }
      });
      Object.entries(this.listOrderPlaced).forEach(([key, orderPlaced]) => {
        if (
          Date.now() - orderPlaced.lastUpdatedAt < 5_000 ||
          this.positionStatus[orderPlaced.symbol]
        )
          return;
        if (orderPlaced.oid && !openOrderMapping[orderPlaced.oid]) {
          delete this.listOrderPlaced[key];
        }
      });
      let triggerSetupOrders = false;
      const countOrders = this.globalState.config.pairConfigs.reduce((r, c) => {
        return r + c.percent.length * 2;
      }, 0);
      const countPlaceOrders = Object.keys(this.listOrderPlaced).length;
      if (countPlaceOrders < countOrders) triggerSetupOrders = true;
      if (triggerSetupOrders) {
        this.listenPriceAndSetupOrders({
          price: this.prices,
          type: PostActionEnum.PLACE_MISSING_ORDERS,
        });
      }
    }
  }

  async syncOpenPositions({ positions }: { positions: PositionDto[] }) {
    this.openingPositions = positions;
  }

  async syncOpenOrders({ orders }: { orders: OrderDto[] }) {
    this.openOrders = orders;
  }

  async checkOpenPositions({ positions }: { positions: PositionDto[] }) {
    Object.keys(this.latestCandle).forEach((key) => {
      if (!positions?.length || !positions.some((p) => p.coin === key))
        delete this.latestCandle[key];
    });
    if (this.forceStop || !this.isInitialized) return;
    const pairConfigs = this.globalState.config.pairConfigs;
    Object.keys(this.positionStatus).forEach((symbol) => {
      if (!positions?.length || !positions.some((p) => p.coin === symbol)) {
        delete this.positionStatus[symbol];
      }
    });
    for (const position of positions) {
      const entryPrice = Number(position.entryPx);
      const unrealizedPnl = Number(position.unrealizedPnl);
      const positionSize = Number(position.szi);
      const positionSizeInUsd = positionSize * entryPrice;
      const unrealizedRoi = (unrealizedPnl / positionSizeInUsd) * 100;
      const symbol = position.coin;
      const pair = symbol + '-USDT';
      const pairConfig = this.globalState.hyperConfig[pair];
      const isLong = positionSize > 0;
      const szDecimals: number = pairConfig.szDecimals;

      const config = pairConfigs.find((v) => v.symbol === symbol);
      if (!config) return;
      const status = this.positionStatus[symbol];
      if (!status) {
        this.positionStatus[symbol] = {
          hasTpOrder: false,
          timeStamp: Date.now(),
          tpOrderId: null,
        };
        const fills = this.userFills[symbol]?.splice(0);
        const filledPrice = entryPrice;
        let tpPercent = config.takeProfitPercent[0];
        if (fills?.length) {
          const orderPlaced = Object.values(this.listOrderPlaced);
          tpPercent = Math.max(
            tpPercent,
            ...orderPlaced
              .filter((v) =>
                fills.find((o) => o.oid.toString() === v.oid.toString()),
              )
              .map((v) => v.tpPercent),
          );
        }
        const change = tpPercent / 100;
        const tpPrice = isLong
          ? filledPrice * (1 + change)
          : filledPrice * (1 - change);
        const price = this.hyperliquidSdk.hyperliquidRoundPrice({
          price: tpPrice,
          maxDecimals: this.hyperliquidSdk.MAX_DECIMALS - szDecimals,
        });

        const res = await this.hyperliquidSdk.placeOrder(
          {
            assetId: pairConfig.index,
            isBuy: !isLong,
            price,
            size: '0',
            isLimit: true,
            reduceOnly: true,
            tif: 'Gtc',
          },
          this.placeOrderService.apiKey,
        );
        const orderId = res?.data?.response?.data?.statuses?.[0]?.resting?.oid;
        if (orderId && this.positionStatus[symbol]) {
          this.positionStatus[symbol].tpOrderId = orderId;
        }
      } else {
        const lastTimeCheck = status.timeStamp;
        if (
          Date.now() - lastTimeCheck >
          (this.globalState.config.timeAutoClose
            ? this.globalState.config.timeAutoClose * 1000
            : 30_000)
        ) {
          try {
            await this.placeOrderService.closePosition({
              coins: [symbol],
              positions: this.openingPositions,
            });
          } catch (error) {}
          return;
        }
        const obPrice = this.prices[position.coin];
        const closePrice = isLong ? obPrice.minPrice : obPrice.maxPrice;
        let canClose = unrealizedRoi > (config.minTpPercent || 0.1);
        if (canClose) {
          if (
            (isLong && Number(closePrice) < entryPrice) ||
            (!isLong && Number(closePrice) > entryPrice)
          ) {
            canClose = false;
          }
        }
        if (canClose) {
          const price = this.hyperliquidSdk.hyperliquidRoundPrice({
            price: Number(closePrice),
            maxDecimals: this.hyperliquidSdk.MAX_DECIMALS - szDecimals,
          });
          await this.hyperliquidSdk.placeOrder(
            {
              assetId: pairConfig.index,
              isBuy: !isLong,
              price,
              size: '0',
              isLimit: true,
              reduceOnly: true,
              tif: 'Ioc',
            },
            this.placeOrderService.apiKey,
          );
        }
      }
    }
  }

  async listenPriceAndSetupOrders({
    price,
    type,
  }: {
    price: {
      [symbol: string]: { symbol: string; minPrice: string; maxPrice: string };
    };
    type: PostActionEnum;
  }) {
    if (this.forceStop) return;
    try {
      const listOrderToPlace: OrderPlaced[] = [];
      this.globalState.config.pairConfigs.forEach((config) => {
        const symbol = config.symbol;
        if (this.positionStatus[symbol]) return;
        const symbolPrice = price[symbol];
        if (symbolPrice == null) {
          return;
        }
        const minPrice = parseFloat(symbolPrice.minPrice);
        const maxPrice = parseFloat(symbolPrice.maxPrice);
        const pair = symbol + '-USDT';
        const pairConfig = this.globalState.hyperConfig[pair];

        const multiple = config.percent.reduce((result, current, index) => {
          const ratio = config.ratio[index];
          return result + current * ratio;
        }, 0);
        config.percent.map((percent, index) => {
          const ratio = config.ratio[index];
          const orderVolume = (config.totalVolume / multiple) * ratio * percent;
          const priceShort = (maxPrice * (100 + percent)) / 100;
          const priceLong = (minPrice * (100 - percent)) / 100;
          const szDecimals: number = pairConfig.szDecimals;
          const limitPriceShort = this.hyperliquidSdk.hyperliquidRoundPrice({
            price: priceShort,
            maxDecimals: this.hyperliquidSdk.MAX_DECIMALS - szDecimals,
          });
          const limitPriceLong = this.hyperliquidSdk.hyperliquidRoundPrice({
            price: priceLong,
            maxDecimals: this.hyperliquidSdk.MAX_DECIMALS - szDecimals,
          });
          const limitSize = ConvertUtils.parseNumberWithFixedDecimal(
            orderVolume / priceShort,
            szDecimals,
          ).toString();
          const assetId = pairConfig.index;
          const orderLimitShort: WsPlaceOrderData = {
            assetId, //assetIndex
            isBuy: false, //isBuy
            price: limitPriceShort, //price
            size: limitSize, //size
            reduceOnly: false, //reduceOnly
            isLimit: true,
          };
          const orderLimitLong: WsPlaceOrderData = {
            assetId, //assetIndex
            isBuy: true, //isBuy
            price: limitPriceLong, //price
            size: limitSize, //size
            reduceOnly: false, //reduceOnly
            isLimit: true,
          };
          const keyLong = `${symbol}_${index}_long`;
          !this.listOrderPlaced[keyLong] &&
            listOrderToPlace.push({
              symbol,
              key: keyLong,
              data: orderLimitLong,
              lastPrice: minPrice,
              lastUpdatedAt: Date.now(),
              needCheckWhenPriceDown: false,
              needCheckWhenPriceUp: false,
              oid: null,
              tpPercent: config.takeProfitPercent[index],
            });
          if (!config.isLong) {
            const keyShort = `${symbol}_${index}_short`;
            !this.listOrderPlaced[keyShort] &&
              listOrderToPlace.push({
                symbol,
                key: keyShort,
                data: orderLimitShort,
                lastPrice: maxPrice,
                lastUpdatedAt: Date.now(),
                needCheckWhenPriceDown: false,
                needCheckWhenPriceUp: false,
                oid: null,
                tpPercent: config.takeProfitPercent[index],
              });
          }
        });
      });
      if (!listOrderToPlace.length) {
        return;
      }
      if (listOrderToPlace.length) {
        try {
          const res = await this.hyperliquidSdk.placeBulkOrder(
            listOrderToPlace.map((v) => this.hyperliquidSdk.getWsOrder(v.data)),
            this.placeOrderService.apiKey,
          );
          res?.data?.response?.data?.statuses?.forEach((v, index) => {
            if (!v.resting?.oid) return;
            try {
              const orderData = listOrderToPlace[index];
              this.listOrderPlaced[orderData.key] = {
                ...orderData,
                oid: v.resting.oid,
                lastUpdatedAt: Date.now(),
                needCheckWhenPriceUp: false,
                needCheckWhenPriceDown: false,
              };
            } catch (error) {}
          });
        } catch (error) {}
        if (type === PostActionEnum.PLACE_MISSING_ORDERS) {
        } else {
          this.isInitialized = true;
        }
      }
    } catch (error) {}
  }

  async listenPriceAndModifyOrder({
    price,
  }: {
    price: {
      [symbol: string]: { symbol: string; minPrice: string; maxPrice: string };
    };
  }) {
    await TimeUtil.sleep(this.globalState.config.timeDelay || 1_000);
    if (this.forceStop || !this.isInitialized) return;
    try {
      const listOrderToModify: OrderToModify[] = [];
      this.globalState.config.pairConfigs.forEach((config) => {
        const symbol = config.symbol;
        const symbolPrice = price[symbol];
        if (symbolPrice == null) {
          return;
        }
        const minPrice = parseFloat(symbolPrice.minPrice);
        const maxPrice = parseFloat(symbolPrice.maxPrice);
        const pair = symbol + '-USDT';
        const pairConfig = this.globalState.hyperConfig[pair];

        config.percent.forEach((percent, index) => {
          {
            const longKey = `${symbol}_${index}_long`;
            const lastOrderLong = this.listOrderPlaced[longKey];
            if (!!lastOrderLong) {
              const lastPrice = lastOrderLong.lastPrice;
              // if (currentPrice > lastPrice)
              // check if price down && percent down > 30% percent
              const deltaPrice = Math.abs(minPrice - lastPrice);
              const priceChange = (deltaPrice / lastPrice) * 100;
              const percentToChange = (percent * this.PERCENT_TO_CHANGE) / 100;
              if (
                (minPrice < lastPrice && priceChange > percentToChange) ||
                (minPrice > lastPrice && priceChange > percentToChange) ||
                (minPrice > lastPrice &&
                  Date.now() - lastOrderLong.lastUpdatedAt > 30_000)
              ) {
                const priceLong = (minPrice * (100 - percent)) / 100;
                const szDecimals: number = pairConfig.szDecimals;
                const limitPriceLong =
                  this.hyperliquidSdk.hyperliquidRoundPrice({
                    price: priceLong,
                    maxDecimals: this.hyperliquidSdk.MAX_DECIMALS - szDecimals,
                  });
                const orderLimitLong: WsPlaceOrderData = {
                  ...lastOrderLong.data,
                  price: limitPriceLong,
                };
                listOrderToModify.push({
                  key: lastOrderLong.key,
                  symbol,
                  data: {
                    oid: lastOrderLong.oid,
                    order: orderLimitLong,
                  },
                  pairConfig: config,
                  currentPrice: minPrice,
                  lastOrder: lastOrderLong.data,
                  tpPercent: config.takeProfitPercent[index],
                });
              }
            }
          }

          const shortKey = `${symbol}_${index}_short`;
          const lastOrderShort = this.listOrderPlaced[shortKey];
          if (!!lastOrderShort) {
            const lastPrice = lastOrderShort.lastPrice;
            // if (currentPrice > lastPrice)
            // check if price down && percent down > 30% percent
            const deltaPrice = Math.abs(maxPrice - lastPrice);
            const priceChange = (deltaPrice / lastPrice) * 100;
            const percentToChange = (percent * this.PERCENT_TO_CHANGE) / 100;
            if (
              (maxPrice > lastPrice && priceChange > percentToChange) ||
              (maxPrice < lastPrice && priceChange > percentToChange) ||
              (maxPrice < lastPrice &&
                Date.now() - lastOrderShort.lastUpdatedAt > 30_000)
            ) {
              const priceShort = (maxPrice * (100 + percent)) / 100;
              const szDecimals: number = pairConfig.szDecimals;
              const limitPriceShort = this.hyperliquidSdk.hyperliquidRoundPrice(
                {
                  price: priceShort,
                  maxDecimals: this.hyperliquidSdk.MAX_DECIMALS - szDecimals,
                },
              );
              const orderLimitShort = {
                ...lastOrderShort.data,
                price: limitPriceShort, //price
              };
              listOrderToModify.push({
                key: lastOrderShort.key,
                symbol,
                data: {
                  oid: lastOrderShort.oid,
                  order: orderLimitShort,
                },
                pairConfig: config,
                currentPrice: maxPrice,
                lastOrder: lastOrderShort.data,
                tpPercent: config.takeProfitPercent[index],
              });
            }
          }
        });
      });

      if (!listOrderToModify.length) {
        return;
      }

      try {
        const res = await this.hyperliquidSdk.modifyBatchOrders(
          listOrderToModify.map((v) => ({
            oid: v.data.oid,
            order: this.hyperliquidSdk.getWsOrder(v.data.order),
          })),
          this.placeOrderService.apiKey,
        );
        res?.data?.response?.data?.statuses?.forEach((v, index) => {
          try {
            const orderModified = listOrderToModify[index];
            if (v.error) {
              delete this.listOrderPlaced[orderModified.key];
            } else if (v.resting?.oid) {
              this.listOrderPlaced[orderModified.key] = {
                symbol: orderModified.symbol,
                key: orderModified.key,
                lastPrice: orderModified.currentPrice,
                lastUpdatedAt: Date.now(),
                oid: v.resting.oid,
                data: {
                  ...orderModified.lastOrder,
                  price: orderModified.data.order.price,
                },
                needCheckWhenPriceUp: false,
                needCheckWhenPriceDown: false,
                tpPercent: orderModified.tpPercent,
              };
            }
          } catch (error) {}
        });
      } catch (error) {}
    } catch (error) {}
  }
}
