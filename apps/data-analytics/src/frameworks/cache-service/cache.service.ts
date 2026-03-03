import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { redisConfig } from '../../configs';

/**
 * CacheService wraps Redis with a graceful in-memory fallback.
 * When Redis is unavailable the service operates in degraded mode:
 * TTLs and Redis-specific ops are no-ops, get/set work in-process.
 */
@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: RedisClientType | null = null;
  private readonly memStore = new Map<string, { value: string; expiresAt: number | null }>();
  private warnedAboutFallback = false;

  async onModuleInit() {
    try {
      const client = createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              return new Error('Redis unreachable — stopping reconnect attempts');
            }
            return Math.min(retries * 200, 1000);
          },
        },
        password: redisConfig.password || undefined,
        database: redisConfig.db,
      }) as RedisClientType;

      client.on('error', () => {
        // errors during reconnect are handled by reconnectStrategy
      });

      await client.connect();
      this.redisClient = client;
      this.logger.log(`Redis connected at ${redisConfig.host}:${redisConfig.port}`);
    } catch (err) {
      if (!this.warnedAboutFallback) {
        this.warnedAboutFallback = true;
        this.logger.warn(
          `Redis connection failed (${err.message}) — running in in-memory mode`,
        );
      }
      this.redisClient = null;
    }
  }

  // ─── Core get/set/del ────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    if (this.redisClient) {
      try {
        return await this.redisClient.get(key);
      } catch (_) {}
    }
    const entry = this.memStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: any, ttl = 0): Promise<void> {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.redisClient) {
      try {
        if (ttl > 0) {
          await this.redisClient.setEx(key, ttl, str);
        } else {
          await this.redisClient.set(key, str);
        }
        return;
      } catch (_) {}
    }
    this.memStore.set(key, {
      value: str,
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
        return;
      } catch (_) {}
    }
    this.memStore.delete(key);
  }

  async exists(key: string): Promise<number> {
    if (this.redisClient) {
      try {
        return await this.redisClient.exists(key);
      } catch (_) {}
    }
    return this.memStore.has(key) ? 1 : 0;
  }

  // ─── Hash ops (Redis only, no-op in mem mode) ────────────────────────────────

  async hSet(key: string, field: string, value: string): Promise<any> {
    if (!this.redisClient) return null;
    try {
      return await this.redisClient.hSet(key, field, value);
    } catch (_) {
      return null;
    }
  }

  async hGet(key: string, field: string, parseJson = false): Promise<any> {
    if (!this.redisClient) return null;
    try {
      const value = await this.redisClient.hGet(key, field);
      if (!parseJson || value == null) return value;
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  async hGetAll(key: string, parseJson = false): Promise<any> {
    if (!this.redisClient) return {};
    try {
      const value = await this.redisClient.hGetAll(key);
      if (!parseJson) return value;
      return Object.entries(value).reduce((acc, [k, v]) => {
        try {
          acc[k] = JSON.parse(v as string);
        } catch (_) {
          acc[k] = v;
        }
        return acc;
      }, {} as Record<string, any>);
    } catch (_) {
      return {};
    }
  }

  async hmSet(key: string, data: Record<string, any>): Promise<any> {
    if (!this.redisClient) return null;
    try {
      return await this.redisClient.hSet(
        key,
        Object.entries(data).reduce((acc, [k, v]) => {
          acc[k] = JSON.stringify(v);
          return acc;
        }, {} as Record<string, string>),
      );
    } catch (_) {
      return null;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.redisClient) return false;
    try {
      return (await this.redisClient.ping()) === 'PONG';
    } catch (_) {
      return false;
    }
  }

  isRedisConnected(): boolean {
    return this.redisClient !== null;
  }

  getClient(): RedisClientType | null {
    return this.redisClient;
  }
}