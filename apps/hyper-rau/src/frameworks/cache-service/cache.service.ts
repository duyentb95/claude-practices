import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Store } from 'cache-manager';
import { RedisClientType } from 'redis';

@Injectable()
export class CacheService {
  private readonly redisClient: RedisClientType;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Store) {
    // @ts-ignore
    this.redisClient = this.cache.store.getClient();
  }
  async get(key: string): Promise<any> {
    return this.cache.get(key);
  }

  async getKeys(key: string): Promise<any> {
    // @ts-ignore
    return this.cache.store.keys(key);
  }

  async mget(keys: string[]): Promise<any> {
    // @ts-ignore
    return this.cache.store.mget(...keys);
  }

  async set(key: string, value: any, ttl = 0) {
    // @ts-ignore
    await this.cache.set(key, value, { ttl });
  }

  async ttl(key: string): Promise<number> {
    // @ts-ignore
    return this.cache.store.ttl(key);
  }

  async del(key: string) {
    await this.cache.del(key);
  }

  async mDel(keys: string[]) {
    await this.redisClient.del(keys);
  }

  async incr(key: string) {
    await this.redisClient.incr(key);
  }

  async setNX(key: string, value: any, ttl = 0): Promise<boolean> {
    const isOk = await this.redisClient.setNX(key, JSON.stringify(value));
    if (isOk && ttl > 0) {
      await this.redisClient.expire(key, ttl);
    }
    return isOk;
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.redisClient.expire(key, ttl);
  }

  async queuePush(key: string, value: any): Promise<number> {
    return this.redisClient.lPush(key, JSON.stringify(value));
  }

  async queuePushBulk(key: string, value: any[]): Promise<number> {
    return this.redisClient.lPush(
      key,
      value.map((v) => JSON.stringify(v)),
    );
  }

  async queuePop(key: string, count = 1): Promise<any[]> {
    const data = await this.redisClient.rPopCount(key, count);
    if (data) {
      return data.map((d) => JSON.parse(d));
    }
    return data;
  }

  async sAdd(key: string, value: string | string[]): Promise<any> {
    return this.redisClient.sAdd(key, value);
  }

  async sPop(key: string, count: number): Promise<any[]> {
    return this.redisClient.sPop(key, count);
  }

  async sRem(key: string, value: string): Promise<number> {
    return this.redisClient.sRem(key, value);
  }

  async sMembers(key: string): Promise<any[]> {
    return this.redisClient.sMembers(key);
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    return this.redisClient.sIsMember(key, member);
  }

  async sCard(key: string): Promise<number> {
    return this.redisClient.sCard(key);
  }

  async hSet(key: string, field: string, value: string): Promise<any> {
    return this.redisClient.hSet(key, field, value);
  }

  async exists(key: string): Promise<any> {
    return this.redisClient.exists(key);
  }

  async hExists(key: string, field: string): Promise<any> {
    return this.redisClient.hExists(key, field);
  }

  async hIncrBy(key: string, field: string, value: number): Promise<any> {
    return this.redisClient.hIncrBy(key, field, value);
  }

  async hDel(key: string, field: string): Promise<any> {
    return this.redisClient.hDel(key, field);
  }

  async hmSet(key, data: any): Promise<any> {
    return this.redisClient.hSet(
      key,
      typeof data === 'object'
        ? Object.entries(data).reduce((acc, [key, value]) => {
            acc[key] = JSON.stringify(value);
            return acc;
          }, {})
        : data,
    );
  }

  async hmGet(key: string, fields: string[]): Promise<any[]> {
    return this.redisClient.hmGet(key, fields);
  }

  async hLen(key: string): Promise<number> {
    return this.redisClient.hLen(key);
  }

  async hGet(key: string, field: string, parseJson = false): Promise<any> {
    const value = await this.redisClient.hGet(key, field);
    if (!parseJson) {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }

  async hGetAll(key: string, parseJson = false): Promise<any> {
    const value = await this.redisClient.hGetAll(key);
    if (!parseJson) {
      return value;
    }

    try {
      return Object.entries(value).reduce((acc, [key, value]) => {
        acc[key] = JSON.parse(value as string);
        return acc;
      }, {});
    } catch (_) {
      return value;
    }
  }

  //options - (NX | (XX & LT & GT)) & CH & INCR https://redis.io/docs/latest/commands/zadd/
  async zAdd(
    key: string,
    values: { value: string; score: number }[],
    options?: any,
  ): Promise<any> {
    return this.redisClient.zAdd(key, values, options);
  }

  async zRank(key: string, member: string): Promise<any> {
    return this.redisClient.zRank(key, member);
  }

  async zCard(key: string): Promise<number> {
    return this.redisClient.zCard(key);
  }

  async zRevRank(key: string, member: string): Promise<any> {
    return this.redisClient.zRevRank(key, member);
  }

  async ping(): Promise<boolean> {
    return (await this.redisClient.ping()) === 'PONG';
  }

  getClient(): RedisClientType {
    return this.redisClient;
  }

  async queuePeek(key: string, count = 1): Promise<any[]> {
    try {
      // Get the total length of the list
      const listLength = await this.redisClient.lLen(key);
      if (listLength === 0) return [];

      // Calculate start and end indices for LRANGE
      const start = Math.max(listLength - count, 0);
      const end = listLength - 1;

      const data = await this.redisClient.lRange(key, start, end);
      if (data) {
        return data.map((d) => JSON.parse(d));
      }
      return [];
    } catch (error) {
      console.error('Error in queuePeek:', error);
      return [];
    }
  }

  async setIfEqual(
    key: string,
    value: any,
    oldValue: any,
    ttl?: number,
  ): Promise<any> {
    const cached = await this.get(key);
    if (cached === oldValue) {
      return this.set(key, value, ttl);
    }
  }
}
