import { encode } from '@msgpack/msgpack';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Method } from 'axios';
import { ethers, getBytes, keccak256, Wallet } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { parse } from 'lossless-json';
import { catchError, lastValueFrom, of } from 'rxjs';
import { CandleData, UserFillDto } from '../../dto/fill.dto';
import { OrderDto, WsPlaceOrderData } from '../../dto/order.dto';
import { Signature } from './interfaces/signature.interface';
import { apiKey, passPhrase, secretKey } from '../../configs';
import { AsyncUtil, Web3Utils } from '../../helpers';
import { ApiKeyDto } from '../../dto/apiKeyDto';

@Injectable()
export class HyperliquidSdkService {
  MAX_DECIMALS = 6;
  private API_URL = 'https://api.hyperliquid.xyz';
  private PHANTOM_DOMAIN = {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
  private AGENT_TYPES = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };
  private BUILDER_CODE = {
    b: '0x055ba87dbff972e23bcf26ea4728c31e05240e66',
    f: 50,
  };
  private apiKey = {
    apiKey: Web3Utils.checksumAddress(apiKey),
    secretKey,
    passPhrase: Web3Utils.checksumAddress(passPhrase),
  };

  constructor(readonly httpService: HttpService) {}

  async getWsPlaceOrder(
    data: {
      assetId: number;
      price: string;
      size: string;
      isBuy: boolean;
      isLimit: boolean;
      reduceOnly: boolean;
      trigger?: any;
      tif?: 'Gtc' | 'Alo' | 'Ioc';
    },
    apiKey: Partial<ApiKeyDto>,
  ) {
    const orderData = {
      action: {
        type: 'order',
        orders: [
          {
            a: data.assetId, //assetIndex
            b: data.isBuy, //isBuy
            p: data.price, //price
            s: data.size, //size
            r: data.reduceOnly, //reduceOnly
            t: {
              limit: {
                tif: data.tif ? data.tif : data.isLimit ? 'Alo' : 'Ioc',
              },
            },
          },
        ],
        // grouping: data?.trigger?.tpsl == null ? 'na' : 'normalTpsl',
        grouping: 'na',
      },
    };

    if (data.trigger) {
      delete orderData.action.orders[0].t['limit'];
      orderData.action.orders[0].t['trigger'] = data.trigger;
    }

    const nonce = new Date().getTime();
    const signature = apiKey
      ? await this.generateSign(
          orderData,
          nonce,
          apiKey.secretKey,
          apiKey.passPhrase,
        )
      : null;

    return {
      payload: orderData,
      signature,
      nonce,
    };
  }

  async getWsModifyBulkOrder(
    data: { orderId: number; order: WsPlaceOrderData }[],
    apiKey: Partial<ApiKeyDto>,
  ) {
    const orderData = {
      action: {
        type: 'batchModify',
        modifies: data.map((v) => ({
          oid: v.orderId,
          order: this.getWsOrder(v.order),
        })),
      },
    };

    const nonce = new Date().getTime();
    const signature = apiKey
      ? await this.generateSign(
          orderData,
          nonce,
          apiKey.secretKey,
          apiKey.passPhrase,
        )
      : null;

    if (apiKey.passPhrase) {
      orderData['vaultAddress'] = apiKey.passPhrase;
    }

    return {
      payload: orderData,
      signature,
      nonce,
    };
  }

  async getWsPlaceBulkOrder(
    data: WsPlaceOrderData[],
    isTp: boolean,
    apiKey: Partial<ApiKeyDto>,
  ) {
    const orderData = {
      action: {
        type: 'order',
        orders: data.map((v) => this.getWsOrder(v)),
        grouping: isTp ? 'normalTpsl' : 'na',
      },
    };

    const nonce = new Date().getTime();
    const signature = apiKey
      ? await this.generateSign(
          orderData,
          nonce,
          apiKey.secretKey,
          apiKey.passPhrase,
        )
      : null;

    if (apiKey.passPhrase) {
      orderData['vaultAddress'] = apiKey.passPhrase;
    }

    return {
      payload: orderData,
      signature,
      nonce,
    };
  }

  getWsOrder(data: WsPlaceOrderData) {
    const _order = {
      a: data.assetId, //assetIndex
      b: data.isBuy, //isBuy
      p: data.price, //price
      s: data.size, //size
      r: data.reduceOnly, //reduceOnly
      t: {
        limit: {
          tif: data.tif ? data.tif : data.isLimit ? 'Alo' : 'Ioc',
        },
      },
    };
    if (data.trigger) {
      delete _order.t['limit'];
      _order.t['trigger'] = data.trigger;
    }
    return _order;
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order
  async placeOrder(
    data: {
      assetId: number;
      price: string;
      size: string;
      isBuy: boolean;
      isLimit: boolean;
      reduceOnly: boolean;
      trigger?: any;
      tif?: 'Gtc' | 'Alo' | 'Ioc';
    },
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    const orderData = {
      action: {
        type: 'order',
        orders: [
          {
            a: data.assetId, //assetIndex
            b: data.isBuy, //isBuy
            p: data.price, //price
            s: data.size, //size
            r: data.reduceOnly, //reduceOnly
            t: {
              limit: {
                tif: data.tif ? data.tif : data.isLimit ? 'Alo' : 'Ioc',
              },
            },
          },
        ],
        grouping: 'na',
      },
    };

    if (data.trigger) {
      delete orderData.action.orders[0].t['limit'];
      orderData.action.orders[0].t['trigger'] = data.trigger;
    }

    // if (!(apiKey.passPhrase?.length > 0) && data.isIncrease) {
    //     orderData.action['builder'] = this.BUILDER_CODE
    // }

    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: orderData,
      apiKey,
      proxyUrl,
    });
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order
  async placeBulkOrder(
    orders: any[],
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    const orderData = {
      action: {
        type: 'order',
        orders,
        grouping: 'na',
        // grouping: orders.length === 1 ? 'na' : 'normalTpsl',
      },
    };

    // if (!(apiKey.passPhrase?.length > 0) && data.isIncrease) {
    //     orderData.action['builder'] = this.BUILDER_CODE
    // }

    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: orderData,
      apiKey,
      proxyUrl,
    });
  }

  async modifyBatchOrders(
    modifies: { oid: number; order: any }[],
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    const orderData = {
      action: {
        type: 'batchModify',
        modifies,
      },
    };

    // if (!(apiKey.passPhrase?.length > 0) && data.isIncrease) {
    //     orderData.action['builder'] = this.BUILDER_CODE
    // }

    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: orderData,
      apiKey,
      proxyUrl,
    });
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order
  async cancelBulkOrder(
    orders: { orderId: number; assetId: number }[],
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    const orderData = {
      action: {
        type: 'cancel',
        cancels: orders.map((v) => ({ a: v.assetId, o: v.orderId })),
      },
    };

    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: orderData,
      apiKey,
      proxyUrl,
    });
  }

  async getWsCancelBulkOrder(orders: any[], apiKey: Partial<ApiKeyDto>) {
    const orderData = {
      action: {
        type: 'cancel',
        cancels: orders,
      },
    };

    const nonce = new Date().getTime();
    const signature = apiKey
      ? await this.generateSign(
          orderData,
          nonce,
          apiKey.secretKey,
          apiKey.passPhrase,
        )
      : null;

    if (apiKey.passPhrase) {
      orderData['vaultAddress'] = apiKey.passPhrase;
    }

    return {
      payload: orderData,
      signature,
      nonce,
    };
  }

  async getUserFills(userAddress: string): Promise<UserFillDto[]> {
    const response = await this.requestAPI({
      method: 'POST',
      path: '/info',
      data: {
        type: 'userFills',
        user: userAddress,
      },
    });
    return response?.data || [];
  }

  async getCandle(req: {
    coin: string;
    interval: '1m';
    startTime: number;
    endTime: number;
  }): Promise<CandleData[]> {
    const response = await this.requestAPI({
      method: 'POST',
      path: '/info',
      data: {
        type: 'candleSnapshot',
        req,
      },
    });
    return response?.data || [];
  }

  async getUserRateLimit(userAddress: string): Promise<any> {
    const response = await this.requestAPI({
      method: 'POST',
      path: '/info',
      data: {
        type: 'userRateLimit',
        user: userAddress,
      },
    });
    return response?.data || [];
  }

  async getUserPositions(userAddress: string): Promise<any> {
    const response = await this.requestAPI({
      method: 'POST',
      path: '/info',
      data: {
        type: 'clearinghouseState',
        user: userAddress,
      },
    });
    return response?.data?.assetPositions || [];
  }
  async getUserOpenOrders(userAddress: string): Promise<OrderDto[]> {
    const response = await this.requestAPI({
      method: 'POST',
      path: '/info',
      data: {
        type: 'openOrders',
        user: userAddress,
        dex: 'ALL_DEXS',
      },
    });
    return response?.data ?? [];
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order
  async stlTpOrder(
    data: {
      assetId: number;
      price: string;
      size: string;
      isBuy: boolean;
      isStopLoss: boolean;
    },
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    const orderData = {
      action: {
        type: 'order',
        orders: [
          {
            a: data.assetId, //assetIndex
            b: data.isBuy, //isBuy
            p: data.price, //price
            s: data.size, //size
            r: true, //reduceOnly
            t: {
              trigger: {
                isMarket: false,
                triggerPx: data.price,
                tpsl: data.isStopLoss ? 'sl' : 'tp',
              },
            },
          },
        ],
        grouping: 'na',
      },
    };

    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: orderData,
      apiKey,
      proxyUrl,
    });
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#cancel-order-s
  async cancelOrder(
    data: {
      assetId: number;
      orderId: number;
    },
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: {
        action: {
          type: 'cancel',
          cancels: [
            {
              a: data.assetId,
              o: data.orderId,
            },
          ],
        },
      },
      apiKey,
      proxyUrl,
    });
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals#retrieve-users-perpetuals-account-summary
  async getBalance(userAddress: string) {
    return this.requestAPI({
      method: 'POST',
      path: '/info',
      data: {
        type: 'clearinghouseState',
        user: userAddress,
      },
    });
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#update-leverage
  async switchLeverage(
    data: {
      assetId: number;
      leverage: number;
      isCross: boolean;
    },
    apiKey: Partial<ApiKeyDto>,
    proxyUrl?: string,
  ) {
    return this.requestAPI({
      method: 'POST',
      path: '/exchange',
      data: {
        action: {
          type: 'updateLeverage',
          asset: data.assetId,
          isCross: data.isCross,
          leverage: data.leverage,
        },
      },
      apiKey,
      proxyUrl,
    });
  }

  //Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#approve-a-builder-fee
  async approveBuilderFee(nonce: number, signature: any, timeout = 15000) {
    const response = await AsyncUtil.wrapPromise(
      lastValueFrom(
        this.httpService
          .request({
            method: 'POST',
            url: `${this.API_URL}/exchange`,
            data: {
              action: {
                type: 'approveBuilderFee',
                hyperliquidChain: 'Mainnet',
                signatureChainId: '0xa4b1',
                maxFeeRate: '0.1%',
                builder: '0x055ba87dbff972e23bcf26ea4728c31e05240e66',
                nonce,
              },
              nonce,
              signature,
            },
            timeout,
            transformResponse: (r) => parse(r),
          })
          .pipe(
            catchError((e) => {
              return of(e.response || { error: e.message });
            }),
          ),
      ),
      timeout + 1000,
      { error: 'Timeout' },
    );
    return this.formatResponse(response);
  }

  async requestAPI(
    options: {
      method: Method;
      path: string;
      proxyUrl?: string;
      data?: any;
      apiKey?: any;
    },
    timeout = 15000, //15 seconds
  ) {
    // eslint-disable-next-line prefer-const
    let { method, path, data, proxyUrl } = options;
    const nonce = new Date().getTime();
    const signature = apiKey
      ? await this.generateSign(
          data,
          nonce,
          this.apiKey?.secretKey,
          this.apiKey?.passPhrase,
        )
      : null;
    let proxy = {};
    if (proxyUrl?.length > 0) {
      proxy = {
        proxy: false,
        httpsAgent: new HttpsProxyAgent(proxyUrl),
      };
    }
    const newData = { ...data, nonce, signature };
    if (this.apiKey?.passPhrase) {
      newData.vaultAddress = this.apiKey.passPhrase;
    }

    const response = await AsyncUtil.wrapPromise(
      lastValueFrom(
        this.httpService
          .request({
            method,
            url: `${this.API_URL}${path}`,
            data: newData,
            timeout,
            ...proxy,
          })
          .pipe(
            catchError((e) => {
              return of(e.response || { error: e.message });
            }),
          ),
      ),
      timeout + 1000,
      { error: 'Timeout' },
    );
    return this.formatResponse(response);
  }

  formatResponse(response: any) {
    const { status, statusText, data } = response || {};
    const returnMsg: string = this.parseError(
      data?.msg ||
        this.existsOrNullStr(statusText) ||
        this.existsOrNullStr(status) ||
        'Response empty',
    );
    return [200, 201].includes(response?.status)
      ? {
          code: status,
          data,
          msg: returnMsg,
        }
      : {
          code: response?.status || 500,
          msg: returnMsg,
        };
  }

  parseError(error: string | any) {
    try {
      if (typeof error === 'string') {
        error = JSON.parse(error);
      }
    } catch (e) {}
    return typeof error === 'object' ? JSON.stringify(error) : error;
  }

  existsOrNullStr(str: string) {
    return !str || str?.length === 0 ? null : str;
  }

  removeEmptyValue(obj) {
    if (!(obj instanceof Object)) return {};
    Object.keys(obj).forEach(
      (key) => this.isEmptyValue(obj[key]) && delete obj[key],
    );
    return obj;
  }

  isEmptyValue(input) {
    return (
      (!input && input !== false && input !== 0) ||
      ((typeof input === 'string' || input instanceof String) &&
        // @ts-ignore
        /^\s+$/.test(input)) ||
      (input instanceof Object && !Object.keys(input).length) ||
      (Array.isArray(input) && !input.length)
    );
  }

  generateSign(
    qsOrBody: any,
    nonce: number,
    secretKey: string,
    vaultAddress: string | null | undefined,
  ) {
    const wallet = new ethers.Wallet(secretKey);
    const hash = this.actionHash(qsOrBody.action, vaultAddress || null, nonce);
    const phantomAgent = this.constructPhantomAgent(hash, true);
    const data = {
      domain: this.PHANTOM_DOMAIN,
      types: this.AGENT_TYPES,
      primaryType: 'Agent',
      message: phantomAgent,
    };
    return this.signInner(wallet, data);
  }

  async signInner(wallet: Wallet, data: any): Promise<Signature> {
    const signature = await wallet.signTypedData(
      data.domain,
      data.types,
      data.message,
    );
    return this.splitSig(signature);
  }

  splitSig(sig: string): Signature {
    const { r, s, v } = ethers.Signature.from(sig);
    return { r, s, v };
  }

  actionHash(
    action: unknown,
    vaultAddress: string | null,
    nonce: number,
  ): string {
    const msgPackBytes = encode(action);
    const additionalBytesLength = vaultAddress === null ? 9 : 29;
    const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
    data.set(msgPackBytes);
    const view = new DataView(data.buffer);
    view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
    if (vaultAddress === null) {
      view.setUint8(msgPackBytes.length + 8, 0);
    } else {
      view.setUint8(msgPackBytes.length + 8, 1);
      data.set(getBytes(vaultAddress), msgPackBytes.length + 9);
    }
    return keccak256(data);
  }

  constructPhantomAgent(hash: string, isMainnet: boolean) {
    return { source: isMainnet ? 'a' : 'b', connectionId: hash };
  }

  hyperliquidRoundPrice({
    price,
    maxDecimals,
    significantDigits = 5,
  }: {
    price: number;
    maxDecimals: number;
    significantDigits?: number;
  }): string {
    if (price === 0) {
      return '0';
    }
    const orderOfMagnitude = Math.floor(Math.log10(Math.abs(price)));
    // Calculate the number of decimal places required to maintain 5 significant digits
    const neededDecimalPlaces = significantDigits - orderOfMagnitude - 1;
    // Determine actual decimal places, considering the maximum limit
    const actualDecimalPlaces = Math.min(
      Math.max(neededDecimalPlaces, 0),
      maxDecimals,
    );
    // Round the number to the appropriate number of decimal places
    const roundedValue = Number(price.toFixed(actualDecimalPlaces));
    if (Number.isInteger(roundedValue)) {
      return `${roundedValue}`;
    }
    // Ensure the result adheres to significant figures rule
    const value = this.toFullPrecision(roundedValue, significantDigits);
    const splitNumber = value.split('.');
    const decimalNumStr =
      splitNumber[1]?.slice(0, maxDecimals)?.replace(/0+$/, '') || '';
    return `${splitNumber[0]}${
      parseFloat(decimalNumStr) > 0 ? `.${decimalNumStr}` : ''
    }`;
  }
  toFullPrecision(num: number, precision: number): string {
    // If the number is too small, just return it as a string
    if (Math.abs(num) < 1e-6) {
      return num.toFixed(precision);
    }
    // Get the precise number string with the specified precision
    const preciseNum = num.toPrecision(precision);
    // If the result is in scientific notation, convert to full string
    if (preciseNum.includes('e')) {
      const [mantissa, exponent] = preciseNum.split('e');
      const exp = parseInt(exponent, 10);
      // Adjust the number according to the exponent
      if (exp > 0) {
        const parts = mantissa.split('.');
        const wholePart = parts[0];
        const decimalPart = parts[1] || '';
        return wholePart + decimalPart.padEnd(exp, '0');
      } else {
        return '0.' + '0'.repeat(Math.abs(exp) - 1) + mantissa.replace('.', '');
      }
    }
    // Return the result if not in scientific notation
    return preciseNum;
  }

  getActualDecimalPlaces({
    price,
    maxDecimals,
    significantDigits = 5,
  }: {
    price: number;
    maxDecimals: number;
    significantDigits?: number;
  }) {
    const orderOfMagnitude = Math.floor(Math.log10(Math.abs(price)));

    // Calculate the number of decimal places required to maintain 6 significant digits
    const neededDecimalPlaces = significantDigits - orderOfMagnitude - 1;

    // Determine actual decimal places, considering the maximum limit
    const actualDecimalPlaces = Math.min(
      Math.max(neededDecimalPlaces, 0),
      maxDecimals,
    );
    return actualDecimalPlaces;
  }
}
