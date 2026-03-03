import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class RedisCacheModule {
  // data-analytics manages its own Redis client directly in CacheService
  // with graceful in-memory fallback when Redis is unavailable.
  static register(_opts?: any) {
    return RedisCacheModule;
  }
}