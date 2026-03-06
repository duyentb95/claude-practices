import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HyperliquidInfoModule } from '../frameworks/hyperliquid/hyperliquid-info.module';
import { CopinInfoModule } from '../frameworks/copin/copin-info.module';
import { WsScannerService } from './ws-scanner.service';
import { RateLimiterService } from './rate-limiter.service';
import { InsiderDetectorService } from './insider-detector.service';
import { LarkAlertService } from './lark-alert.service';

@Module({
  imports: [HttpModule, HyperliquidInfoModule, CopinInfoModule],
  providers: [WsScannerService, RateLimiterService, InsiderDetectorService, LarkAlertService],
  exports: [WsScannerService, InsiderDetectorService],
})
export class ScannerModule {}