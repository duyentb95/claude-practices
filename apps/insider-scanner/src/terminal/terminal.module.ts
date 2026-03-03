import { Module } from '@nestjs/common';
import { ScannerModule } from '../scanner/scanner.module';
import { TerminalService } from './terminal.service';

@Module({
  imports: [ScannerModule],
  providers: [TerminalService],
})
export class TerminalModule {}