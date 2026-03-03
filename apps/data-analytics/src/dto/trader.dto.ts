export interface CoinStatsDto {
  coin: string;
  realizedPnl: number;
  fees: number;
  netPnl: number;
  volume: number;
  trades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
}

export interface TraderStatsDto {
  address: string;
  computedAt: number;
  periodDays: number;

  // PnL metrics
  realizedPnl: number;
  totalFees: number;
  fundingReceived: number;
  netPnl: number;

  // Trade metrics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;

  // Volume
  totalVolume: number;
  avgTradeSize: number;

  // Best / worst single trade
  bestTrade: number;
  worstTrade: number;

  // Trade direction breakdown
  longTrades: number;
  shortTrades: number;

  // Per-coin breakdown sorted by abs(realizedPnl) desc
  coinStats: CoinStatsDto[];
}

export interface PositionEntryDto {
  coin: string;
  szi: string;             // signed size (+ = long, - = short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  leverage: {
    type: 'cross' | 'isolated';
    value: number;
    rawUsd?: string;
  };
  cumFunding: {
    allTime: string;
    sinceOpen: string;
    sinceChange: string;
  };
  maxLeverage: number;
}

export interface AccountStateDto {
  address: string;
  accountValue: string;
  totalNtlPos: string;
  withdrawable: string;
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  positions: PositionEntryDto[];
}