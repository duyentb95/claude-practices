import * as dotEnv from 'dotenv';

dotEnv.config();

export const port = process.env.PORT || 3234;
export const hyperApiUrl =
  process.env.HYPER_API_URL || 'https://api.hyperliquid.xyz';

export const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  db: parseInt(process.env.REDIS_DB) || 0,
  password: process.env.REDIS_PASSWORD || undefined,
};