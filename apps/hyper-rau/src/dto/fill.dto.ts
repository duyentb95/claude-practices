export interface UserFillDto {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
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
export interface HyperUserFillDto {
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
  cloid: string;
}

export interface CandleData {
  T: number; //1681924499999,
  c: string; //"29258.0",
  h: string; //"29309.0",
  i: string; //"15m",
  l: string; //"29250.0",
  n: number; //189,
  o: string; //"29295.0",
  s: string; //"BTC",
  t: number; //1681923600000,
  v: string; //"0.98639"
}
