import 'reflect-metadata';
import {
  LOOPBACK_HOST,
  assertLoopbackListener,
  stopOnSignal,
} from '@zazzles/exchange-config';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { Environment } from './config/environment.js';

/** The one service on the Express adapter, which speaks HTTP/1.1 and nothing else. */
const adapter = new ExpressAdapter();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    adapter,
  );
  stopOnSignal(app);
  await app.listen(app.get(Environment).NOTIFICATIONS_PORT, LOOPBACK_HOST);
  assertLoopbackListener(app.getHttpServer().address());
}
await bootstrap();
