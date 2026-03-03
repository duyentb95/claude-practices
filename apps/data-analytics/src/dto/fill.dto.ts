export interface HyperFillDto {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  startPosition: string;
  dir:
    | 'Open Long'
    | 'Open Short'
    | 'Close Long'
    | 'Close Short'
    | 'Short > Long'
    | 'Long > Short';
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
  liquidation?: any;
  cloid?: string;
}

export interface UserFundingDto {
  time: number;
  coin: string;
  usdc: string;      // funding payment in USDC (positive = received, negative = paid)
  szi: string;       // signed position size at time of payment
  fundingRate: string;
}

export interface CandleDto {
  T: number;   // close time ms
  c: string;   // close price
  h: string;   // high price
  i: string;   // interval
  l: string;   // low price
  n: number;   // number of trades
  o: string;   // open price
  s: string;   // symbol/coin
  t: number;   // open time ms
  v: string;   // volume
}