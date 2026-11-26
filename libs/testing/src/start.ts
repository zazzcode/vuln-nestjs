import { INestApplication, Type } from '@nestjs/common';
import { AbstractHttpAdapter, NestFactory } from '@nestjs/core';
import {
  LOOPBACK_HOST,
  type ServiceName,
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

/** A service as a test starts it: its module, the adapter it uses, and its port. */
export interface ServiceOptions {
  module: Type<unknown>;
  /** Creates the adapter its service uses. Required: a test that uses another one tests another stack. */
  adapter: () => AbstractHttpAdapter;
  port: number;
}

export interface ServiceHandle {
  readonly app: INestApplication;
  readonly port: number;
  readonly url: string;
  /** The HTTP version of every request this listener has received, in order. */
  receivedHttpVersions(): readonly string[];
  /** Stops the service. Throws if a database process or temporary directory it created remains. */
  stop(): Promise<void>;
}

/** A service that is running. `close` stops it; only `stop` also checks what it left behind. */
interface Running extends ServiceHandle {
  close(): Promise<void>;
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

/** The whole lab, started in this process. */
export interface Lab {
  readonly services: Record<ServiceName, ServiceHandle>;
  /** The gateway: the only address a client uses. */
  readonly url: string;
  /** Stops the gateway, then the backend services. Throws if anything they created remains. */
  stop(): Promise<void>;
}

export type LabServices = Record<ServiceName, ServiceOptions>;

/** The gateway composes the graph at start, so the three backend services are healthy before it boots. */
const START_ORDER: readonly ServiceName[] = [
  'accounts',
  'trading',
  'notifications',
  'gateway',
];

/** Starts the whole lab in the test process: backends first, each healthy before the next, then the gateway. */
export async function startLab(options: LabServices): Promise<Lab> {
  const before = await databaseFootprint();
  const started = new Map<ServiceName, Running>();
  const stop = async (): Promise<void> => {
    for (const name of [...START_ORDER].reverse()) {
      await started.get(name)?.close();
    }
    await assertFootprintGone(before);
  };
  try {
    for (const name of START_ORDER) {
      started.set(
        name,
        await startOne(
          options[name],
          name === 'gateway' ? GATEWAY_HEALTH_PATH : HEALTH_PATH,
          before,
        ),
      );
    }
  } catch (error) {
    await stop();
    throw error;
  }
  const running = {} as Record<ServiceName, Running>;
  for (const name of START_ORDER) {
    running[name] = started.get(name) as Running;
  }
  return { services: running, url: running.gateway.url, stop };
}

async function startOne(
  options: ServiceOptions,
  healthPath: string,
  before: DatabaseFootprint,
): Promise<Running> {
  const app = await NestFactory.create(options.module, options.adapter(), {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  const received: string[] = [];
  const server: Server = app.getHttpServer();
  server.on('request', (request) => {
    received.push(request.httpVersion);
  });
  await app.listen(options.port, LOOPBACK_HOST);
  assertLoopbackListener(server.address());
  const url = `http://${LOOPBACK_HOST}:${options.port}`;
  await waitForHealth(`${url}${healthPath}`);
  return {
    app,
    port: options.port,
    url,
    receivedHttpVersions: () => [...received],
    close: () => app.close(),
    stop: async () => {
      await app.close();
      await assertFootprintGone(before);
    },
  };
}
