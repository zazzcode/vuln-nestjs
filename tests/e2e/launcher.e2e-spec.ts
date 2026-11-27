import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  assertFootprintGone,
  databaseFootprint,
} from '@zazzles/exchange-testing';
import { answersOn } from '../../scripts/relay.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const GATEWAY = 'http://127.0.0.1:3000';

/** The color codes of a terminal, which the services' logger writes when its output is not a terminal. */
const COLOR_CODE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const STILL_RUNNING = 'still running after two minutes';

/**
 * How `pnpm start` ends once an interrupt has stopped the lab cleanly, by where
 * it runs. On macOS with the launcher's exit code, 0, through corepack's wrapper
 * and through pnpm's own binary alike. On CI's Linux runner by the interrupt
 * itself, on each run that reached this test, and it says nothing about the
 * launcher, which may still be stopping the lab. A stop is therefore judged by
 * what is left of the run, which `stopByInterrupt` checks.
 */
const CLEAN_ENDS = [
  { code: 0, signal: null },
  { code: null, signal: 'SIGINT' },
];

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface LauncherRun {
  /** The process group of the package manager, the launcher and the four services: what a terminal's Ctrl-C reaches. */
  group: number;
  output: () => string;
  exited: Promise<Exit>;
}

/** The gateway's answer once the lab is up; null until it is. */
const gatewayHealth = (): Promise<{ status: string } | null> =>
  fetch(`${GATEWAY}/api/v1/health`, { signal: AbortSignal.timeout(1_000) })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

/**
 * `pnpm start` as a person runs it, in a process group of its own, so that an
 * interrupt can be delivered to the whole group exactly as a terminal's Ctrl-C
 * delivers it.
 */
function startAsAPersonWould(): Promise<LauncherRun> {
  return new Promise((resolve, reject) => {
    const printed: string[] = [];
    const launcher = spawn('pnpm', ['start'], {
      cwd: root,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [launcher.stdout, launcher.stderr]) {
      stream.on('data', (chunk: Buffer) => printed.push(chunk.toString()));
    }
    launcher.once('error', reject);
    launcher.once('spawn', () => {
      const group = launcher.pid;
      if (group === undefined) {
        reject(new Error('The launcher started without a process id.'));
        return;
      }
      resolve({
        group,
        output: () => printed.join('').replace(COLOR_CODE, ''),
        exited: new Promise((done) =>
          launcher.once('exit', (code, signal) => done({ code, signal })),
        ),
      });
    });
  });
}

/** Resolves when the launcher has exited, or with a message after two minutes. */
function exitOf(run: LauncherRun): Promise<Exit | string> {
  return Promise.race([run.exited, delay(120_000).then(() => STILL_RUNNING)]);
}

/**
 * Whether nothing is left of the run, waiting until the deadline. The package
 * manager, the launcher, the services and their engines are all in its process
 * group, so it is empty once the run is over.
 */
async function nothingLeftOf(
  run: LauncherRun,
  deadline: number,
): Promise<boolean> {
  for (;;) {
    try {
      // Signal 0 asks whether anything is left of the group. It throws when nothing is.
      process.kill(-run.group, 0);
    } catch {
      return true;
    }
    if (performance.now() > deadline) {
      return false;
    }
    await delay(50);
  }
}

/**
 * Ctrl-C to the run, as a terminal delivers it to the whole process group, and
 * what a clean stop shows: the package manager ended as `CLEAN_ENDS` says,
 * nothing of the run is left within the limit, and no service had to be killed
 * instead of stopping.
 */
async function stopByInterrupt(run: LauncherRun): Promise<void> {
  const interrupted = performance.now();
  process.kill(-run.group, 'SIGINT');
  expect(CLEAN_ENDS).toContainEqual(await exitOf(run));
  // Where the package manager ended by the interrupt itself, the launcher was still stopping the lab.
  expect(await nothingLeftOf(run, interrupted + 20_000)).toBe(true);
  expect(run.output()).not.toContain('did not stop cleanly');
}

/** Stops a lab that a test did not get to stop, so that a failing test cannot leave it for the next one. */
async function makeSureItIsGone(run: LauncherRun): Promise<void> {
  try {
    process.kill(-run.group, 'SIGINT');
    // What is left stops as the launcher does, its engines included. What is still there after the limit is killed.
    if (!(await nothingLeftOf(run, performance.now() + 20_000))) {
      process.kill(-run.group, 'SIGKILL');
    }
  } catch {
    // The group is gone already.
  }
  await nothingLeftOf(run, performance.now() + 5_000);
}

describe('the start command', () => {
  // Unlike the other files of this suite, this one starts no lab in the test process: the launcher runs the four built services.
  test('starts the services in order and stops all of them on an interrupt, leaving nothing behind', async () => {
    const before = await databaseFootprint();
    const run = await startAsAPersonWould();
    try {
      // The first start on a machine downloads a database binary before the backend services can answer.
      let health: { status: string } | null = null;
      for (let attempt = 0; attempt < 8_000 && health === null; attempt += 1) {
        health = await gatewayHealth();
        if (health === null) {
          await delay(100);
        }
      }
      expect(health).toMatchObject({ status: 'ok' });
      // The gateway answers a moment before the launcher, having seen it, names the addresses.
      for (
        let attempt = 0;
        attempt < 200 && !run.output().includes('The lab is up');
        attempt += 1
      ) {
        await delay(50);
      }

      // A relay reaches its service, which speaks HTTP/2, for a caller on HTTP/1.1.
      const throughTheRelay = await fetch(
        'http://127.0.0.1:3201/internal/health',
      ).then((response) => response.json());
      expect(throughTheRelay).toMatchObject({
        status: 'ok',
        service: 'accounts',
      });

      const printed = run.output();
      const announced = (name: string) =>
        printed.indexOf(`${name}: starting on 127.0.0.1:`);
      expect(announced('accounts')).toBeGreaterThan(-1);
      expect(announced('trading')).toBeGreaterThan(announced('accounts'));
      expect(announced('notifications')).toBeGreaterThan(announced('trading'));
      expect(announced('gateway')).toBeGreaterThan(announced('notifications'));
      // The relays are named with the addresses a person uses.
      expect(printed).toContain(
        'Relay     accounts: HTTP/1.1 on http://127.0.0.1:3201, carried to the service over HTTP/2',
      );
      expect(printed).toContain(
        'Relay     trading: HTTP/1.1 on http://127.0.0.1:3202, carried to the service over HTTP/2',
      );
      // The secrets of the run are passed to the processes and never printed.
      expect(printed).not.toMatch(
        /JWT_SECRET|INTERNAL_SERVICE_TOKEN|x-internal-token|[0-9a-f]{64}/,
      );

      await stopByInterrupt(run);
      expect(await gatewayHealth()).toBeNull();
      // The relays closed with the rest: nothing listens where they were.
      for (const port of [3201, 3202]) {
        expect({ port, listening: await answersOn(port) }).toEqual({
          port,
          listening: false,
        });
      }
      await assertFootprintGone(before);
    } finally {
      await makeSureItIsGone(run);
    }
  }, 900_000);

  // A person who starts the lab and changes their mind before it is up must still get a clean stop.
  test('an interrupt while the lab is still coming up stops whatever had started, leaving nothing behind', async () => {
    const before = await databaseFootprint();
    const run = await startAsAPersonWould();
    try {
      // The launcher starts trading only once accounts has answered, and trading then takes about six seconds
      // to start MySQL. When trading has just been announced, accounts is up with its mongod and trading is
      // part-way through starting its mysqld: both have something that must be stopped.
      const tradingAnnounced = 'trading: starting on 127.0.0.1:';
      for (
        let attempt = 0;
        attempt < 600 && !run.output().includes(tradingAnnounced);
        attempt += 1
      ) {
        await delay(50);
      }
      const printed = run.output();
      expect(printed.indexOf(tradingAnnounced)).toBeGreaterThan(
        printed.indexOf('accounts: starting on 127.0.0.1:'),
      );
      expect(printed).not.toContain('The lab is up');

      await stopByInterrupt(run);
      // Accounts was up: it must have gone down with its engine.
      await expect(
        fetch('http://127.0.0.1:3101/internal/health', {
          signal: AbortSignal.timeout(2_000),
        }),
      ).rejects.toThrow();
      expect(await gatewayHealth()).toBeNull();
      await assertFootprintGone(before);
    } finally {
      await makeSureItIsGone(run);
    }
  }, 600_000);
});
