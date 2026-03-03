import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { CrawlCexTradeConfigService } from './crawl-cex-trade-config.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [CrawlCexTradeConfigService],
  controllers: [],
})
export class CrawlCexInfoModule {}
