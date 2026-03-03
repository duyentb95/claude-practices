import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

import { GlobalStateService } from './global-state.service';
import { HyperliquidSdkService } from '../frameworks/hyperliquid/hyperliquid-sdk.service';
import { PositionDto } from '../dto/position.dto';
import { apiKey, passPhrase, secretKey } from '../configs';
import { Web3Utils } from '../helpers';
import { SafeFunctionGuard } from '../decorator';

@Injectable()
export class PlaceOrderService {
  private socket: WebSocket;
  private;
  public apiKey = {
    apiKey: Web3Utils.checksumAddress(apiKey),
    secretKey,
    passPhrase: Web3Utils.checksumAddress(passPhrase),
  };

  constructor(
    private readonly hyperliquidSdk: HyperliquidSdkService,
    private readonly globalState: GlobalStateService,
  ) {
    console.log(this.apiKey);
  }

  parseNumberWithFixedDecimal(val: number, decimal: number): number {
    return parseFloat(val.toFixed(decimal));
  }

  async setMarginMode({
    assetId,
    leverage,
  }: {
    assetId: number;
    leverage: number;
  }) {
    await this.hyperliquidSdk.switchLeverage(
      {
        assetId,
        leverage,
        isCross: false,
      },
      this.apiKey,
    );
  }

  @SafeFunctionGuard()
  async cancelOrdersHTTP(params?: {
    symbol?: string;
    side?: 'A' | 'B';
    reduceOnly?: boolean;
  }) {
    const { symbol, side, reduceOnly } = params ?? {};
    try {
      const orders = await this.hyperliquidSdk.getUserOpenOrders(
        this.apiKey.apiKey,
      );
      const orderIds = orders
        .filter(
          (o) =>
            (symbol ? o.coin === symbol : true) &&
            (side ? o.side === side : true) &&
            (reduceOnly != null ? o.reduceOnly === reduceOnly : true),
        )
        .map((o) => {
          const hyperConfig = this.globalState.hyperConfig;
          const pairConfig = hyperConfig[`${o.coin}-USDT`];
          return {
            assetId: pairConfig?.index,
            orderId: o.oid,
          };
        })
        .filter((o) => o.assetId != null);
      if (!orderIds.length) {
        return;
      }

      await this.hyperliquidSdk.cancelBulkOrder(orderIds, this.apiKey);
    } catch (error) {
      console.log(error);
    }
  }

  @SafeFunctionGuard()
  async closePosition({
    positions,
    coins,
  }: {
    positions: PositionDto[];
    coins: string[];
  }) {
    for (const position of positions) {
      if (!coins.includes(position.coin)) {
        continue;
      }
      const hyperConfig = this.globalState.hyperConfig;
      const pairConfig = hyperConfig[`${position.coin}-USDT`];
      const isLong = parseFloat(position.szi) > 0;
      const marketPrice =
        parseFloat(position.entryPx) * (1 + 0.1 * (isLong ? -1 : 1));
      const res = await this.hyperliquidSdk.placeOrder(
        {
          assetId: pairConfig.index,
          price: this.hyperliquidSdk.hyperliquidRoundPrice({
            price: marketPrice,
            maxDecimals:
              this.hyperliquidSdk.MAX_DECIMALS - pairConfig.szDecimals,
          }),
          size: this.parseNumberWithFixedDecimal(
            Math.abs(parseFloat(position.szi)),
            pairConfig.szDecimals,
          ).toString(),
          isBuy: !isLong,
          isLimit: false,
          reduceOnly: true,
          // isIncrease: false,
        },
        this.apiKey,
      );
      console.log('close position', res);
    }
  }
}
