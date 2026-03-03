import { NestFactory } from '@nestjs/core';
import { InsiderScannerModule } from './insider-scanner.module';

const WEB_PORT = parseInt(process.env.WEB_PORT || '3235');

async function bootstrap() {
  const app = await NestFactory.create(InsiderScannerModule, {
    // Suppress NestJS startup noise — terminal renderer owns stdout
    logger: ['error', 'warn'],
  });

  // Allow browser access from any origin (local tool)
  app.enableCors();

  await app.listen(WEB_PORT);

  // Graceful shutdown
  const shutdown = async () => {
    process.stdout.write('\x1b[?25h\n'); // restore cursor if terminal was used
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();