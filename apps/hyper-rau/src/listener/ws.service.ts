import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WebSocket } from 'ws';

import { PositionDto } from '../dto/position.dto';
import { apiKey, hyperWsUrl } from '../configs';
import { GlobalStateService } from './global-state.service';
import { PlaceOrderService } from './place-order.service';
import { OrderManagementService } from './order-management.service';
import { ORDER_STATUS, OrderDto } from '../dto/order.dto';
import { SafeFunctionGuard } from '../decorator';

@Injectable()
export class WsService {
  private socket: WebSocket | null = null;

  // Post data
  private isConnectingWS = false;

  constructor(
    private readonly orderManagement: OrderManagementService,
    private readonly globalState: GlobalStateService,
    private readonly placeOrderService: PlaceOrderService,
  ) {
    setTimeout(
      async function () {
        await this.connectWebSocket();
      }.bind(this),
      0,
    );
  }

  resetState() {
    this.socket = null;
    this.isConnectingWS = false;
    this.orderManagement.clearStorageData();
    this.globalState.clearStorageData();
  }

  @Interval(5000)
  async checkSocket() {
    if (
      (!this.socket || this.socket?.readyState === WebSocket.CLOSED) &&
      this.globalState.config?.isEnable
    ) {
      await this.connectWebSocket();
    }

    this.socket?.send(JSON.stringify({ method: 'ping' }));
  }

  async connectWebSocket() {
    const config = await this.globalState.getConfig();
    console.log('config', config);
    if (!config?.isEnable) return;
    console.log('Time: ', new Date().toISOString());
    console.log('Connecting to WebSocket...');
    if (this.isConnectingWS) return;
    this.isConnectingWS = true;
    this.socket = new WebSocket(hyperWsUrl);
    this.orderManagement.setSocket(this.socket);

    // On connection opened
    this.socket.on('open', () => {
      console.log('Time: ', new Date().toISOString());
      console.log('Connected to WebSocket.');
      config.pairConfigs.forEach((c) => {
        this.socket.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: {
              type: 'l2Book',
              coin: c.symbol,
              // nSigFigs: null,
            },
          }),
        );
      });

      console.log('Subscribe', apiKey);
      this.sendMessageUser(apiKey, true);
      setTimeout(() => {
        this.globalState.isInitialized = true;
      }, 5_000);
    });

    // On error
    this.socket.on('error', (error) => {
      console.error('WebSocket Error:', error.message);
    });

    // Handle incoming messages
    this.socket.on('message', async (data: any) => {
      try {
        const response = JSON.parse(data.toString());
        switch (response.channel) {
          case 'allMids': {
            // break;
            // this.orderManagement.syncPrices(response);
            break;
          }
          case 'userFills': {
            this.orderManagement.syncUserFills(response);
            break;
          }

          case 'l2Book': {
            const symbol = response?.data?.coin;
            const books = response?.data?.levels;
            if (symbol && books?.length) {
              const minPrice = books[0]?.[0]?.px as string;
              const maxPrice = books[1]?.[0]?.px as string;
              this.orderManagement.syncPrices({ symbol, minPrice, maxPrice });
              break;
            }
            break;
          }

          case 'openOrders': {
            const orders = (response.data.orders as OrderDto[]).map((v) => ({
              ...v,
              status: ORDER_STATUS.open,
            }));
            this.orderManagement.syncOpenOrders({
              orders,
            });
            break;
          }
          case 'allDexsClearinghouseState': {
            const positions: PositionDto[] = [];
            response.data.clearinghouseStates?.forEach(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ([_, state]: [string, any]) => {
                state.assetPositions.forEach((p) => {
                  positions.push(p.position);
                });
              },
            );
            this.orderManagement.syncOpenPositions({
              positions,
            });
            break;
          }
          case 'post': {
            switch (response?.data?.response?.type) {
              case 'action':
                await this.checkActionInfoType(
                  response.data.id,
                  response.data.response.payload,
                );
                break;
              case 'error':
                console.log(response?.data?.response);
                break;
            }
          }
        }
      } catch (e) {
        console.log(e);
      }
    });

    // Handle connection close and reconnect after 10 seconds
    this.socket.on('close', async (code: number, reason: Buffer) => {
      console.log('Time: ', new Date().toISOString());
      console.log(
        `WebSocket closed (Code: ${code}, Reason: ${reason.toString()})`,
      );
      await this.placeOrderService.cancelOrdersHTTP();
      this.resetState();
    });
  }

  @SafeFunctionGuard()
  async checkActionInfoType(uniqueId: number, response: any) {
    this.orderManagement.syncActionType(uniqueId, response);
  }

  sendMessageUser(account: string, isSubscribe: boolean) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    ['userFills', 'allDexsClearinghouseState'].forEach((type) => {
      this.socket.send(
        JSON.stringify({
          method: isSubscribe ? 'subscribe' : 'unsubscribe',
          subscription: {
            type,
            user: account,
          },
        }),
      );
    });
    this.socket.send(
      JSON.stringify({
        method: isSubscribe ? 'subscribe' : 'unsubscribe',
        subscription: {
          type: 'openOrders',
          user: account,
          dex: 'ALL_DEXS',
        },
      }),
    );
  }
}
