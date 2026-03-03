import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GlobalModule } from './global/global.module';
import { ListenerModule } from './listener/listener.module';
import { HyperliquidSdkModule } from './frameworks/hyperliquid/hyperliquid-sdk.module';
import { RedisCacheModule } from './frameworks/cache-service/cache.module';
import { CrawlCexInfoModule } from './crawl-cex-info/crawl-cex-info.module';

@Module({
  imports: [
    RedisCacheModule,
    ScheduleModule.forRoot(),
    GlobalModule,
    ListenerModule,
    HyperliquidSdkModule,
    CrawlCexInfoModule,
  ],
})
export class HyperliquidWsModule {}
