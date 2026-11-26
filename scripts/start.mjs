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

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');

/**
 * The services, in the order they start. The gateway composes the graph at
 * start, so the others are healthy before it boots. Each speaks on its own
 * listener: HTTP/2 cleartext or HTTP/1.1, which decides how its health is asked.
 */
export const START_ORDER = Object.freeze([
  Object.freeze({
    name: 'accounts',
    port: 3101,
    portVariable: 'ACCOUNTS_PORT',
    transport: 'http2',
    health: '/internal/health',
  }),
  Object.freeze({
    name: 'trading',
    port: 3102,
    portVariable: 'TRADING_PORT',
    transport: 'http2',
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
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let announcedAt = Date.now() + 2_000;
  for (;;) {
    if (await isHealthy(service, environment)) {
      return;
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
 * Starts the lab as four processes, in start order, each healthy before the
 * next. Stops everything if a service fails to come up. Returns the gateway's
 * address and a `stop` function that stops the gateway first, then checks that
 * nothing was left behind.
 */
export async function startLab({
  cwd = repositoryRoot,
  environment = process.env,
  output = process.stdout,
  log = console.log,
} = {}) {
  const secrets = generateRunSecrets();
  const before = {
    processes: engineProcesses(),
    directories: temporaryDirectories(),
  };
  const children = new Map();
  const forced = [];

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
    // The gateway first: it is the one that talks to the others.
    for (const service of [...START_ORDER].reverse()) {
      await stopOne(service);
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

  try {
    for (const service of START_ORDER) {
      log(
        `${service.name}: starting on 127.0.0.1:${portOf(service, environment)}`,
      );
      const child = spawn(
        process.execPath,
        [path.join(cwd, 'apps', service.name, 'dist', 'main.js')],
        {
          cwd,
          env: { ...environment, ...secrets },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      children.set(service.name, child);
      for (const [stream, write] of [
        [child.stdout, output.write.bind(output)],
        [child.stderr, output.write.bind(output)],
      ]) {
        let line = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          for (const part of chunk.split(/(?<=\n)/)) {
            if (part.endsWith('\n')) {
              write(`${service.name} | ${line}${part}`);
              line = '';
            } else {
              line += part;
            }
          }
        });
      }
      await waitForHealth(service, { environment, log });
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return {
    url: `http://127.0.0.1:${portOf(START_ORDER.at(-1), environment)}`,
    stop,
    secrets,
    children,
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

  const lab = await startLab();
  console.log(
    `\nThe lab is up, on loopback only. Stop it with Ctrl-C.\n  GraphQL   POST ${lab.url}/graphql\n  Health    GET  ${lab.url}/api/v1/health\n  Reset     POST ${lab.url}/api/v1/lab/reset\n`,
  );

  let stopping = false;
  const stopWith = (exitCode) => {
    if (stopping) {
      return;
    }
    stopping = true;
    return lab.stop().then((outcome) => {
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
    });
  };

  // A service that dies takes the lab with it: it is started again as a whole.
  for (const [name, child] of lab.children) {
    child.once('exit', (code, signal) => {
      if (!stopping) {
        stopping = true;
        console.log(
          `\n${name} exited (${signal ?? code}): stopping the rest of the lab.`,
        );
        void stopWith(1);
      }
    });
  }

  // A second interrupt while the lab is stopping changes nothing: the stop that began is the one that finishes.
  process.on('SIGINT', () => void stopWith(1));
  process.on('SIGTERM', () => void stopWith(1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
