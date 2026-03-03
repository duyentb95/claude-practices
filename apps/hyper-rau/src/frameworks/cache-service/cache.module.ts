import { CacheModule } from '@nestjs/cache-manager';
import { DynamicModule, Global, Module } from '@nestjs/common';

import { CacheService } from './cache.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const redisStore = require('cache-manager-redis-store').redisStore;

@Global()
@Module({})
export class RedisCacheModule {
  static register({
    config,
  }: {
    config: { host: string; port: number; db: number; password: string };
  }): DynamicModule {
    return {
      module: RedisCacheModule,
      imports: [
        CacheModule.register({
          store: redisStore,
          socket: {
            host: config.host,
            port: config.port,
          },
          password: config.password,
          database: config.db,
        }),
      ],
      providers: [CacheService],
      exports: [CacheService],
    };
  }
}
