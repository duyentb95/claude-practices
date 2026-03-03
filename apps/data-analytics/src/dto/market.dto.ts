export interface PerpMetaDto {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface AssetCtxDto {
  funding: string;        // current hourly funding rate
  openInterest: string;   // open interest in coins
  prevDayPx: string;      // previous day's price
  dayNtlVlm: string;      // 24h notional volume USD
  premium: string;        // mark price premium over oracle
  oiNtlVlm: string;       // open interest in USD
  markPx: string;         // mark price
  midPx: string;          // mid price
  impactPxs?: string[];   // [bid, ask] impact prices for 5k USD
}

export interface MarketDataDto {
  coin: string;
  meta: PerpMetaDto;
  ctx: AssetCtxDto;
  priceChange24h: number;
  priceChangePct24h: number;
}

export interface MarketSnapshotDto {
  timestamp: number;
  metas: PerpMetaDto[];
  ctxs: AssetCtxDto[];
}

export interface LeaderboardEntryDto {
  ethAddress: string;
  accountValue: string;
  windowPnl: string;
  allTimePnl: string;
  vlm: string;
  prize?: string;
}