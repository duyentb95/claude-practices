import { NestFactory } from '@nestjs/core';
import { HyperliquidWsModule } from './hyperliquid-ws.module';
import { port } from './configs';

async function bootstrap() {
  const app = await NestFactory.create(HyperliquidWsModule);
  await app.listen(port);
  console.log(port);
}
bootstrap();
