import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ServiceName } from '@zazzles/exchange-config';
import { START_ORDER, portOf, startLab } from '../../scripts/start.mjs';
import { answersOn, type Door } from '../../scripts/door.mjs';
import { elsewhere, outboundReports, type OutboundReport } from './outbound.js';

/** Loaded into each service's process, before the service, so that it reports its outgoing connections when it stops. */
const OUTBOUND_HOOK = fileURLToPath(
  new URL('./outbound-hook.mjs', import.meta.url),
);

const SERVICES: readonly ServiceName[] = [
  'accounts',
  'trading',
  'notifications',
  'gateway',
];

/** A lab that is running, started by the code `pnpm start` runs. */
export interface LabRun {
  /** The gateway: the only address a client uses. */
  readonly url: string;
  /** The secrets of this run, made by the launcher and shared by its four processes. A test signs tokens with them. */
  readonly secrets: { JWT_SECRET: string; INTERNAL_SERVICE_TOKEN: string };
  /** The address of a service, on its own port. A test calls a service directly only when its listener is the point. */
  serviceUrl(service: ServiceName): string;
  /** The address a tool on HTTP/1.1 reaches a service by: its own listener, or the door in front of it. */
  http1Url(service: ServiceName): string;
  /** The process of a service, for a test that needs to take one down. */
  process(service: ServiceName): ChildProcess;
  /** Stops one service the way the launcher stops it, with an interrupt, and waits until it has exited. */
  stopService(service: ServiceName): Promise<void>;
}

/**
 * One lab run for the file that calls this: four processes, started by the
 * launcher's own code, each healthy before the next. The run stops after the
 * file's tests, and the stop fails the file in three cases:
 *
 * - a database process or a temporary directory the run created remained;
 * - a service had to be killed instead of stopping;
 * - a service's process did not report, or reported a connection or a name
 *   resolution that does not go to this machine.
 *
 * The lab cannot be started inside the test process. Nest's code-first GraphQL
 * keeps every registered type in one storage per process, so two subgraphs in
 * one process put two `User` types into it and the gateway cannot compose
 * them. A lab is four processes or nothing. Vitest gives a test file no way to
 * share live objects with another file either, so each file runs its own lab.
 * The cost is one more start of MySQL, about six seconds.
 */
export function useLab(): () => LabRun {
  let run: LabRun | undefined;
  let doors: readonly Door[] = [];
  let stop:
    (() => Promise<{ forced: string[]; leftBehind: unknown }>) | undefined;
  let printed: () => string = () => '';

  beforeAll(async () => {
    const lab = await startLab({
      // Quiet while all is well. What the services printed is shown with a failing test.
      output: { write: () => undefined },
      log: () => undefined,
      execArgv: ['--import', OUTBOUND_HOOK],
    });
    stop = lab.stop;
    printed = lab.printed;
    doors = lab.doors;
    const definitionOf = (service: ServiceName) => {
      const definition = START_ORDER.find(
        (candidate) => candidate.name === service,
      );
      if (!definition) {
        throw new Error(`There is no service called ${service}`);
      }
      return definition;
    };
    const childOf = (service: ServiceName): ChildProcess =>
      lab.children.get(service) as ChildProcess;
    run = {
      url: lab.url,
      secrets: lab.secrets,
      serviceUrl: (service) =>
        `http://127.0.0.1:${portOf(definitionOf(service))}`,
      // A service on HTTP/2 is reached through the door the launcher opened in front of it.
      http1Url: (service) =>
        doors.find((door) => door.service === service)?.url ??
        `http://127.0.0.1:${portOf(definitionOf(service))}`,
      process: childOf,
      stopService: async (service) => {
        const child = childOf(service);
        const exited = new Promise<void>((resolve) =>
          child.once('exit', () => resolve()),
        );
        child.kill('SIGINT');
        await exited;
      },
    };
  }, 300_000);

  afterAll(async () => {
    if (!stop) {
      return;
    }
    // By the time this resolves, everything a stopping service wrote has been read.
    const outcome = await stop();
    expect(outcome.forced).toEqual([]);
    expect(outcome.leftBehind).toEqual({ processes: [], directories: [] });
    // A door is a listener the run opened in this process. Nothing listens where it was.
    for (const door of doors) {
      expect(
        { service: door.service, listening: await answersOn(door.port) },
        door.url,
      ).toEqual({ service: door.service, listening: false });
    }

    const reports = outboundReports(printed());
    expect([...reports.keys()].sort()).toEqual([...SERVICES].sort());
    for (const service of SERVICES) {
      // The lab sends no telemetry and reads no metadata endpoint: it connects to this machine and to nothing else.
      expect(elsewhere(reports.get(service) as OutboundReport)).toEqual({
        connections: [],
        lookups: [],
      });
    }
  }, 120_000);

  return () => run as LabRun;
}
