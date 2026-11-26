import 'reflect-metadata';
import {
  LOOPBACK_HOST,
  assertLoopbackListener,
} from '@zazzles/exchange-config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { Environment } from './config/environment.js';

/** HTTP/2 cleartext, with prior knowledge: this listener speaks nothing else. */
const adapter = new FastifyAdapter({ http2: true });

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );
  app.enableShutdownHooks();
  await app.listen(app.get(Environment).TRADING_PORT, LOOPBACK_HOST);
  assertLoopbackListener(app.getHttpServer().address());
}
await bootstrap();
