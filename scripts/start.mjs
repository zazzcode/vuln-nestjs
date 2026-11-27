// The start command: builds what is missing, makes the secrets of a run, starts
// the three backend services, waits until each is healthy, starts the gateway,
// and stops everything when it is interrupted. It depends on Node alone: it is
// what starts the services, so it cannot depend on them.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { connect } from 'node:http2';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { openDoor } from './door.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');

/**
 * @typedef {object} Service
 * @property {string} name
 * @property {number} port Where the service listens by default.
 * @property {string} portVariable The variable that moves it.
 * @property {'http1' | 'http2'} transport What its listener speaks.
 * @property {number} [doorPort] Where a door in front of it listens by default. Set for a service on HTTP/2 only.
 * @property {string} [doorPortVariable] The variable that moves the door.
 * @property {string} health The path that answers 200 once the service is up.
 */

/**
 * The services, in the order they start. The gateway composes the graph at
 * start, so the others are healthy before it boots. Each speaks on its own
 * listener: HTTP/2 cleartext or HTTP/1.1, which decides how its health is asked.
 * A service on HTTP/2 has a door in front of it, a listener on HTTP/1.1 that
 * carries each request to it: curl, Postman, Newman and Burp do not speak HTTP/2
 * without TLS.
 *
 * @type {readonly Service[]}
 */
export const START_ORDER = Object.freeze([
  Object.freeze({
    name: 'accounts',
    port: 3101,
    portVariable: 'ACCOUNTS_PORT',
    transport: 'http2',
    doorPort: 3201,
    doorPortVariable: 'ACCOUNTS_DOOR_PORT',
    health: '/internal/health',
  }),
  Object.freeze({
    name: 'trading',
    port: 3102,
    portVariable: 'TRADING_PORT',
    transport: 'http2',
    doorPort: 3202,
    doorPortVariable: 'TRADING_DOOR_PORT',
    health: '/internal/health',
  }),
  Object.freeze({
    name: 'notifications',
    port: 3103,
    portVariable: 'NOTIFICATIONS_PORT',
    transport: 'http1',
    health: '/internal/health',
  }),
  Object.freeze({
    name: 'gateway',
    port: 3000,
    portVariable: 'GATEWAY_PORT',
    transport: 'http1',
    health: '/api/v1/health',
  }),
]);

/** The database engines the backend services start, by process name. */
export const ENGINES = Object.freeze(['mongod', 'mysqld']);

/**
 * The first start on a machine downloads two database binaries before the
 * backend services can answer, so waiting for health gets a long allowance.
 */
export const HEALTH_TIMEOUT_MS = 15 * 60 * 1000;

/** A service that does not stop after an interrupt is given this long before it is killed. */
export const STOP_GRACE_MS = 10_000;

/** Two secrets for one run. Nothing sensitive is read from the environment, and nothing is written to disk. */
export function generateRunSecrets() {
  return {
    JWT_SECRET: randomBytes(32).toString('hex'),
    INTERNAL_SERVICE_TOKEN: randomBytes(32).toString('hex'),
  };
}

/** The port a service listens on: its own variable, else its default. */
export function portOf(service, environment = process.env) {
  return Number(environment[service.portVariable] ?? service.port);
}

/** The services that speak HTTP/2, and so have a door in front of them, in start order. */
export const SERVICES_WITH_A_DOOR = Object.freeze(
  START_ORDER.filter((service) => service.doorPort !== undefined),
);

/** The port a service's door listens on: its own variable, else its default. */
export function doorPortOf(service, environment = process.env) {
  return Number(environment[service.doorPortVariable] ?? service.doorPort);
}

/** The services whose built entry point is missing, in start order. */
export function missingBuilds(root = repositoryRoot) {
  return START_ORDER.filter(
    (service) =>
      !existsSync(path.join(root, 'apps', service.name, 'dist', 'main.js')),
  ).map((service) => service.name);
}

/**
 * The temporary directories one run can leave behind: the data directory of a
 * `mongod` the lab starts, and of a `mysqld`. The binaries the two packages
 * cache are not among them: those stay, and are reused.
 */
export function temporaryDirectories(base = tmpdir()) {
  const inside = (directory) => {
    try {
      return readdirSync(directory).map((entry) => path.join(directory, entry));
    } catch {
      return [];
    }
  };
  return [
    ...inside(base).filter((entry) =>
      entry.startsWith(path.join(base, 'mongo-mem-')),
    ),
    ...inside(path.join(base, 'mysqlmsn', 'dbs')),
  ].sort();
}

/**
 * The database engine processes that are running. A machine may run its own;
 * only those that appear while the lab runs are ever the lab's.
 */
export function engineProcesses() {
  const pids = (name) => {
    try {
      return execFileSync('pgrep', ['-x', name], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter((pid) => pid !== '')
        .map((pid) => ({ pid: Number(pid), name }));
    } catch {
      // pgrep exits with 1 when no such process runs, or is not installed.
      return [];
    }
  };
  return ENGINES.flatMap(pids).sort((a, b) => a.pid - b.pid);
}

/** What exists now and did not when the lab started: what a stop that was not clean leaves. */
export function leftovers(
  before,
  now = { processes: engineProcesses(), directories: temporaryDirectories() },
) {
  const knownProcesses = new Set(
    before.processes.map((process) => process.pid),
  );
  const knownDirectories = new Set(before.directories);
  return {
    processes: now.processes.filter(
      (process) => !knownProcesses.has(process.pid),
    ),
    directories: now.directories.filter(
      (directory) => !knownDirectories.has(directory),
    ),
  };
}

/** Asks a service whether it is up, over the transport its listener speaks. Never throws. */
export function isHealthy(service, environment = process.env) {
  const url = new URL(
    `http://127.0.0.1:${portOf(service, environment)}${service.health}`,
  );
  return service.transport === 'http2'
    ? http2StatusIs(url, 200)
    : fetch(url, { signal: AbortSignal.timeout(2_000) }).then(
        (response) => response.status === 200,
        () => false,
      );
}

/** One HTTP/2 request over cleartext, with prior knowledge: that listener speaks nothing else. */
function http2StatusIs(url, expected) {
  return new Promise((resolve) => {
    const session = connect(url.origin);
    session.on('error', () => resolve(false));
    const stream = session.request({ ':path': url.pathname });
    let status = 0;
    stream.on('error', () => {
      session.destroy();
      resolve(false);
    });
    // The status travels with the response headers. It is not a property of the stream.
    stream.on('response', (head) => {
      status = Number(head[':status']);
    });
    // The response is read to its end before the session closes. A session closed over
    // an unread response stays open on both sides, and the service then waits on it when stopped.
    stream.on('data', () => {});
    stream.on('end', () => {
      session.close();
      resolve(status === expected);
    });
    stream.end();
  });
}

/** Resolves when the service answers its health path with 200. Rejects when it has not in time. */
export async function waitForHealth(
  service,
  {
    environment = process.env,
    timeoutMs = HEALTH_TIMEOUT_MS,
    log = () => {},
    signal,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let announcedAt = Date.now() + 2_000;
  for (;;) {
    if (await isHealthy(service, environment)) {
      return;
    }
    if (signal?.aborted) {
      throw new Error(`Interrupted while waiting for ${service.name}.`);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${service.name} did not answer on 127.0.0.1:${portOf(service, environment)} within ${Math.round(timeoutMs / 1000)} seconds`,
      );
    }
    if (Date.now() > announcedAt) {
      log(
        `${service.name} has not answered yet. The first start on a machine downloads a database binary first.`,
      );
      announcedAt = Infinity;
    }
    await delay(100);
  }
}

/**
 * @typedef {object} StopOutcome
 * @property {string[]} forced The services that had to be killed instead of stopping.
 * @property {{ processes: { pid: number, name: string }[], directories: string[] }} leftBehind Engine processes
 *   and temporary directories that exist now and did not when the lab started.
 */

/**
 * @typedef {object} LabOptions
 * @property {string} [cwd] The repository. The built entry points are read from under it.
 * @property {NodeJS.ProcessEnv} [environment] Where the ports come from.
 * @property {{ write(line: string): unknown }} [output] Where each line a service prints goes, with its name in front.
 * @property {(line: string) => void} [log] Where the launcher's own messages go.
 * @property {string[]} [execArgv] Given to each service's Node, before its entry point. The end-to-end suite
 *   loads a watch for outgoing connections that way.
 * @property {AbortSignal} [signal] Aborting it abandons a start in progress: no further service is started,
 *   and the start fails once the services started so far have stopped. What stopped them is the caller.
 * @property {(stop: () => Promise<StopOutcome>) => void} [onStop] Called with the stop function before the first
 *   service starts, so that a caller can be ready to be interrupted at any moment.
 */

/**
 * Starts the lab as four processes, in start order, each healthy before the
 * next, with a door in front of each service on HTTP/2. Stops everything if a
 * service fails to come up. Returns the gateway's address, the secrets of the
 * run, the doors, the processes, what they printed, and a `stop` function that
 * closes the doors first, stops the gateway next, then checks that nothing was
 * left behind.
 *
 * @param {LabOptions} [options]
 * @returns {Promise<{ url: string, secrets: { JWT_SECRET: string, INTERNAL_SERVICE_TOKEN: string }, doors: import('./door.mjs').Door[], children: Map<string, import('node:child_process').ChildProcess>, printed: () => string, stop: () => Promise<StopOutcome> }>}
 */
export async function startLab({
  cwd = repositoryRoot,
  environment = process.env,
  output = process.stdout,
  log = console.log,
  execArgv = [],
  signal,
  onStop,
} = {}) {
  const secrets = generateRunSecrets();
  const before = {
    processes: engineProcesses(),
    directories: temporaryDirectories(),
  };
  const children = new Map();
  const doors = [];
  const forced = [];
  const printed = [];

  const stopOne = async (service) => {
    const child = children.get(service.name);
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    // Nest closes the application on this signal: every store's engine is stopped first.
    child.kill('SIGINT');
    const exited = new Promise((resolve) => child.once('exit', resolve));
    if (
      !(await Promise.race([
        exited.then(() => true),
        delay(STOP_GRACE_MS).then(() => false),
      ]))
    ) {
      log(
        `${service.name} did not stop within ${STOP_GRACE_MS / 1000} seconds: killing it.`,
      );
      forced.push(service.name);
      child.kill('SIGKILL');
      await exited;
    }
  };

  const stop = async () => {
    // The doors first, then the gateway: each is a caller of the services.
    await Promise.all(doors.map((door) => door.close()));
    // The gateway first: it is the one that talks to the others.
    for (const service of [...START_ORDER].reverse()) {
      await stopOne(service);
      const child = children.get(service.name);
      // A service killed without stopping has nothing more to say; one that stopped reports as it exits.
      if (child && !forced.includes(service.name)) {
        await Promise.race([drained(child), delay(STOP_GRACE_MS)]);
      }
    }
    // A service that had to be killed could not stop its engine or remove its directory.
    const left = leftovers(before);
    if (forced.length > 0) {
      for (const { pid, name } of left.processes) {
        log(`Stopping ${name} (${pid}), left running by ${forced.join(', ')}.`);
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // It ended on its own in the meantime.
        }
      }
      for (const directory of left.directories) {
        log(`Removing ${directory}, left behind by ${forced.join(', ')}.`);
        rmSync(directory, { recursive: true, force: true });
      }
    }
    return { forced, leftBehind: leftovers(before) };
  };

  /** Resolves when nothing more will come from a service: it has exited and its output has been read to the end. */
  const drained = (child) =>
    Promise.all(
      [child.stdout, child.stderr]
        .filter((stream) => !stream.readableEnded)
        .map((stream) => new Promise((resolve) => stream.once('end', resolve))),
    );

  // From here a caller can stop what has started, before anything has.
  onStop?.(stop);

  try {
    // A door is open before its service is, and carries a request to a service that is not up as a 502.
    for (const service of SERVICES_WITH_A_DOOR) {
      log(
        `${service.name}: a door on 127.0.0.1:${doorPortOf(service, environment)}, speaking HTTP/1.1`,
      );
      doors.push(
        await openDoor({
          service: service.name,
          port: doorPortOf(service, environment),
          target: `http://127.0.0.1:${portOf(service, environment)}`,
        }),
      );
    }
    for (const service of START_ORDER) {
      // Interrupted while coming up: nothing more is started.
      if (signal?.aborted) {
        throw new Error('Interrupted before the lab was up.');
      }
      log(
        `${service.name}: starting on 127.0.0.1:${portOf(service, environment)}`,
      );
      const child = spawn(
        process.execPath,
        [...execArgv, path.join(cwd, 'apps', service.name, 'dist', 'main.js')],
        {
          cwd,
          env: { ...environment, ...secrets },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      children.set(service.name, child);
      // Each line a service prints is passed on with its name in front, and kept.
      for (const [stream, write] of [
        [child.stdout, output.write.bind(output)],
        [child.stderr, output.write.bind(output)],
      ]) {
        let line = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          for (const part of chunk.split(/(?<=\n)/)) {
            if (part.endsWith('\n')) {
              const whole = `${service.name} | ${line}${part}`;
              write(whole);
              printed.push(whole);
              line = '';
            } else {
              line += part;
            }
          }
        });
      }
      await waitForHealth(service, { environment, log, signal });
    }
  } catch (error) {
    // Interrupted: whoever aborted the signal stops the services, once. For any other failure, they are stopped here.
    if (!signal?.aborted) {
      await stop();
    }
    throw error;
  }
  return {
    url: `http://127.0.0.1:${portOf(START_ORDER.at(-1), environment)}`,
    stop,
    secrets,
    doors,
    children,
    printed: () => printed.join(''),
  };
}

async function main() {
  const missing = missingBuilds();
  if (missing.length > 0) {
    console.log(
      `Building first: no built entry point for ${missing.join(', ')}.`,
    );
    await new Promise((resolve, reject) => {
      // Under `pnpm start` the package manager's own path is given; elsewhere it is looked up.
      const build = spawn(process.env.npm_execpath ?? 'pnpm', ['build'], {
        cwd: repositoryRoot,
        stdio: 'inherit',
      });
      build.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`The build exited with ${code}`)),
      );
    });
  }

  // Ready to be interrupted before anything starts. An interrupt that arrives while the lab is still
  // coming up then stops whatever has started of it, instead of ending the launcher and leaving it.
  const interrupt = new AbortController();
  let stopping = false;
  let stop = async () => ({
    forced: [],
    leftBehind: { processes: [], directories: [] },
  });

  /** Ends the process once everything has stopped. 0 when the lab stopped as asked. */
  const finish = (exitCode) => (outcome) => {
    if (outcome.forced.length > 0) {
      console.log(
        `\nThe lab did not stop cleanly: ${outcome.forced.join(', ')} had to be killed.`,
      );
      console.log(
        `What was left behind afterwards: ${JSON.stringify(outcome.leftBehind)}`,
      );
    }
    process.exit(
      outcome.forced.length > 0 || outcome.leftBehind.processes.length > 0
        ? exitCode
        : 0,
    );
  };

  // A second interrupt while the lab is stopping changes nothing: the stop that began is the one that finishes.
  const stopWith = (exitCode) => {
    if (stopping) {
      return undefined;
    }
    stopping = true;
    interrupt.abort();
    return stop().then(finish(exitCode));
  };
  process.on('SIGINT', () => void stopWith(1));
  process.on('SIGTERM', () => void stopWith(1));

  let lab;
  try {
    lab = await startLab({
      signal: interrupt.signal,
      onStop: (real) => {
        stop = real;
      },
    });
  } catch (error) {
    // Interrupted on the way up: the stop that began with the signal ends the process.
    if (stopping) {
      return;
    }
    console.error(error.message);
    process.exit(1);
  }

  console.log(
    [
      '',
      'The lab is up, on loopback only. Stop it with Ctrl-C.',
      `  GraphQL   POST ${lab.url}/graphql`,
      `  Health    GET  ${lab.url}/api/v1/health`,
      `  Reset     POST ${lab.url}/api/v1/lab/reset`,
      // A tool that does not speak HTTP/2 without TLS reaches these two through their doors.
      ...lab.doors.map(
        (door) =>
          `  Door      ${door.service}: HTTP/1.1 on ${door.url}, carried to the service over HTTP/2`,
      ),
      '',
    ].join('\n'),
  );

  // A service that dies takes the lab with it: it is started again as a whole.
  for (const [name, child] of lab.children) {
    child.once('exit', (code, signal) => {
      if (!stopping) {
        stopping = true;
        console.log(
          `\n${name} exited (${signal ?? code}): stopping the rest of the lab.`,
        );
        void stop().then(finish(1));
      }
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
