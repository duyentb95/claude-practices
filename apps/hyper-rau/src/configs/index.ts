import * as dotEnv from 'dotenv';

dotEnv.config();

const _env = process.env.NODE_ENV || 'development';
export const env = _env;
export const port = process.env.PORT || '3000';
export const tag = process.env.TAG;
export const apiKey = process.env.API_KEY_RAU_1;
export const secretKey = process.env.SECRET_KEY_RAU_1;
export const passPhrase = process.env.PASS_PHRASE_RAU_1 || null;
export const hyperWsUrl =
  process.env.HYPER_WS_URL || 'wss://api.hyperliquid.xyz/ws';

export const redisConfig = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT),
  db: parseInt(process.env.REDIS_DB),
  password: process.env.REDIS_PASSWORD,
};
