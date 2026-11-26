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

/**
 * HTTP/1.1 at the edge. curl, Postman, Newman and Burp negotiate HTTP/2 only
 * over TLS, and the lab has no TLS.
 */
const adapter = new FastifyAdapter();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );
  app.enableShutdownHooks();
  await app.listen(app.get(Environment).GATEWAY_PORT, LOOPBACK_HOST);
  assertLoopbackListener(app.getHttpServer().address());
}
await bootstrap();
