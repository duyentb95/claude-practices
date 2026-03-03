import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { HyperliquidSdkService } from './hyperliquid-sdk.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [HyperliquidSdkService],
  exports: [HyperliquidSdkService],
})
export class HyperliquidSdkModule {}
