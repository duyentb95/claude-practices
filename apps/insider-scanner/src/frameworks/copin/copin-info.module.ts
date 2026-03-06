import { Module } from '@nestjs/common';
import { CopinInfoService } from './copin-info.service';

@Module({
  providers: [CopinInfoService],
  exports:   [CopinInfoService],
})
export class CopinInfoModule {}
