import { NestFactory } from '@nestjs/core';
import { DataAnalyticsModule } from './data-analytics.module';
import { port } from './configs';

async function bootstrap() {
  const app = await NestFactory.create(DataAnalyticsModule);
  app.enableCors();
  await app.listen(port);
  console.log(`data-analytics listening on port ${port}`);
}
bootstrap();