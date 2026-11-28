import 'reflect-metadata';
import {
  LOOPBACK_HOST,
  assertLoopbackListener,
  stopOnSignal,
} from '@zazzles/exchange-config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { Environment } from './config/environment.js';
import { registerEdge } from './edge/edge.js';
import { OpenapiService } from './openapi/openapi.service.js';

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
  stopOnSignal(app);
  // The edge's security middleware, on the routes the modules just registered.
  await registerEdge(app);
  // The API document, built once from the routes that exist.
  app.get(OpenapiService).buildFor(app);
  await app.listen(app.get(Environment).GATEWAY_PORT, LOOPBACK_HOST);
  assertLoopbackListener(app.getHttpServer().address());
}
await bootstrap();
