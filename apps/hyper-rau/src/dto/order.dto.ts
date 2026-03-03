export interface OrderDto {
  coin: string;
  side: 'A' | 'B';
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  triggerCondition: string;
  isTrigger: boolean;
  triggerPx: string;
  children: any[];
  isPositionTpsl: boolean;
  reduceOnly: boolean;
  orderType: string;
  origSz: string;
  tif: string;
  cloid: string;
  status: ORDER_STATUS;
}

export enum ORDER_STATUS {
  'canceled' = 'canceled',
  'open' = 'open',
  'filled' = 'filled',
  'triggered' = 'triggered',
  'rejected' = 'rejected',
  'marginCanceled' = 'marginCanceled',
}

export type WsPlaceOrderData = {
  assetId: number;
  price: string;
  size: string;
  isBuy: boolean;
  isLimit: boolean;
  reduceOnly: boolean;
  trigger?: any;
  tif?: 'Gtc' | 'Alo' | 'Ioc';
};
