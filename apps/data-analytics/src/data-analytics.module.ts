import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisCacheModule } from './frameworks/cache-service/cache.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CollectorModule } from './collector/collector.module';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    RedisCacheModule,
    AnalyticsModule,
    CollectorModule,
  ],
})
export class DataAnalyticsModule {}