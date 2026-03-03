import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { HyperliquidInfoService } from './hyperliquid-info.service';

@Module({
  imports: [HttpModule],
  providers: [HyperliquidInfoService],
  exports: [HyperliquidInfoService],
})
export class HyperliquidInfoModule {}