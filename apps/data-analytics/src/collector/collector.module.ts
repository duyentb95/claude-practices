import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { HyperliquidInfoModule } from '../frameworks/hyperliquid/hyperliquid-info.module';
import { DataCollectorService } from './data-collector.service';

@Module({
  imports: [AnalyticsModule, HyperliquidInfoModule],
  providers: [DataCollectorService],
})
export class CollectorModule {}