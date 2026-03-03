import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { ScannerModule } from './scanner/scanner.module';
import { AppController } from './web/app.controller';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    ScannerModule,
  ],
  controllers: [AppController],
})
export class InsiderScannerModule {}