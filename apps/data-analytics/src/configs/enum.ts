export enum REDIS_KEY {
  MARKET_SNAPSHOT = 'analytics:market_snapshot',
  LEADERBOARD = 'analytics:leaderboard',
  TRADER_STATS = 'analytics:trader_stats',
}

export enum CandleInterval {
  ONE_MIN = '1m',
  FIVE_MIN = '5m',
  FIFTEEN_MIN = '15m',
  ONE_HOUR = '1h',
  FOUR_HOUR = '4h',
  ONE_DAY = '1d',
}

export enum LeaderboardWindow {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  ALL_TIME = 'allTime',
}

export const TRADER_STATS_TTL = 120; // 2 minutes
export const MARKET_SNAPSHOT_TTL = 60; // 1 minute
export const LEADERBOARD_TTL = 300; // 5 minutes