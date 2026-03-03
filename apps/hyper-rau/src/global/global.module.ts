import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { RedisCacheModule } from '../frameworks/cache-service/cache.module';
import { redisConfig } from '../configs';

@Global()
@Module({
  imports: [HttpModule, RedisCacheModule.register({ config: redisConfig })],
})
export class GlobalModule {}
