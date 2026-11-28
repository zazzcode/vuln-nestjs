import { INestApplication, Type } from '@nestjs/common';
import type { NestApplicationOptions } from '@nestjs/common';
import { AbstractHttpAdapter, NestFactory } from '@nestjs/core';
import {
  LOOPBACK_HOST,
  assertLoopbackListener,
} from '@zazzles/exchange-config';
import type { Server } from 'node:http';
import {
  assertFootprintGone,
  databaseFootprint,
  type DatabaseFootprint,
} from './database-footprint.js';
import { waitForHealth } from './request.js';

/** Where a backend service says it is up. */
export const HEALTH_PATH = '/internal/health';
/** Where the gateway says it is up. */
export const GATEWAY_HEALTH_PATH = '/api/v1/health';

/** A service as a test starts it: its module, the adapter it uses, its port, and the options its process is created with. */
export interface ServiceOptions {
  module: Type<unknown>;
  /** Creates the adapter its service uses. Required: a test that uses another one tests another stack. */
  adapter: () => AbstractHttpAdapter;
  port: number;
  /**
   * NestJS's own options for the application, passed as given. A service whose
   * `main.ts` creates its application with one gives it here too, so that a
   * test starts the service as its process does. `logger` and `abortOnError`
   * are the launcher's.
   */
  applicationOptions?: Omit<NestApplicationOptions, 'logger' | 'abortOnError'>;
}

export interface ServiceHandle {
  readonly app: INestApplication;
  readonly port: number;
  readonly url: string;
  /** The HTTP version of every request this listener has received, in order. */
  receivedHttpVersions(): readonly string[];
  /** Stops the service, and throws if a database process or temporary directory it created remains. */
  stop(): Promise<void>;
}

/**
 * Starts one service, alone, and waits until it is healthy. A service's own
 * tests use it. The gateway waits for `/api/v1/health`, a backend for `/internal/health`.
 */
export async function startService(
  options: ServiceOptions,
): Promise<ServiceHandle> {
  const before = await databaseFootprint();
  const healthPath = options.port === 3000 ? GATEWAY_HEALTH_PATH : HEALTH_PATH;
  return startOne(options, healthPath, before);
}

/**
 * There is deliberately no function here that starts the whole lab in this
 * process. Nest's code-first GraphQL keeps every registered type in one
 * storage per process, so two subgraphs in one process put two `User` types
 * into it and the gateway cannot compose them: "Schema must contain uniquely
 * named types but contains multiple types named User". A lab is four
 * processes or nothing. The end-to-end suite starts them through the start
 * command, `scripts/start.mjs`; a service's own tests start that service here.
 */

async function startOne(
  options: ServiceOptions,
  healthPath: string,
  before: DatabaseFootprint,
): Promise<ServiceHandle> {
  const app = await NestFactory.create(options.module, options.adapter(), {
    logger: ['error', 'warn'],
    abortOnError: false,
    ...options.applicationOptions,
  });
  const received: string[] = [];
  const server: Server = app.getHttpServer();
  server.on('request', (request) => {
    received.push(request.httpVersion);
  });
  const url = `http://${LOOPBACK_HOST}:${options.port}`;
  // A start that fails must not leave a running service, or its database engine, behind.
  try {
    await app.listen(options.port, LOOPBACK_HOST);
    assertLoopbackListener(server.address());
    await waitForHealth(`${url}${healthPath}`);
  } catch (error) {
    await app.close();
    throw error;
  }
  return {
    app,
    port: options.port,
    url,
    receivedHttpVersions: () => [...received],
    stop: async () => {
      await app.close();
      await assertFootprintGone(before);
    },
  };
}
