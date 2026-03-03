export class LeverageDto {
  type: string;
  value: number;
  rawUsd: string;
}

export class CumFundingDto {
  allTime: string;
  sinceOpen: string;
  sinceChange: string;
}

export interface PositionDto {
  coin: string;
  szi: string;
  leverage: LeverageDto;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string;
  marginUsed: string;
  maxLeverage: number;
  cumFunding: CumFundingDto;
}
