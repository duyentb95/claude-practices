import { Module } from '@nestjs/common';
import { HyperliquidInfoModule } from '../frameworks/hyperliquid/hyperliquid-info.module';
import { TraderAnalyticsService } from './trader-analytics.service';
import { MarketAnalyticsService } from './market-analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [HyperliquidInfoModule],
  providers: [TraderAnalyticsService, MarketAnalyticsService],
  controllers: [AnalyticsController],
  exports: [TraderAnalyticsService, MarketAnalyticsService],
})
export class AnalyticsModule {}