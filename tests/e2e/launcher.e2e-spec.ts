import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  assertFootprintGone,
  databaseFootprint,
} from '@zazzles/exchange-testing';
import { answersOn } from '../../scripts/door.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const GATEWAY = 'http://127.0.0.1:3000';

/** The color codes of a terminal, which the services' logger writes when its output is not a terminal. */
const COLOR_CODE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const STILL_RUNNING = 'still running after two minutes';

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

/** Stops a lab that a test did not get to stop, so that a failing test cannot leave it for the next one. */
async function makeSureItIsGone(run: LauncherRun): Promise<void> {
  try {
    process.kill(-run.group, 'SIGINT');
    await Promise.race([run.exited, delay(20_000)]);
    process.kill(-run.group, 'SIGKILL');
  } catch {
    // The group is gone already.
  }
  await Promise.race([run.exited, delay(5_000)]);
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

      // A door reaches its service, which speaks HTTP/2, for a caller on HTTP/1.1.
      const throughTheDoor = await fetch(
        'http://127.0.0.1:3201/internal/health',
      ).then((response) => response.json());
      expect(throughTheDoor).toMatchObject({
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
      // The doors are named with the addresses a person uses.
      expect(printed).toContain(
        'Door      accounts: HTTP/1.1 on http://127.0.0.1:3201, carried to the service over HTTP/2',
      );
      expect(printed).toContain(
        'Door      trading: HTTP/1.1 on http://127.0.0.1:3202, carried to the service over HTTP/2',
      );
      // The secrets of the run are passed to the processes and never printed.
      expect(printed).not.toMatch(
        /JWT_SECRET|INTERNAL_SERVICE_TOKEN|x-internal-token|[0-9a-f]{64}/,
      );

      // Ctrl-C: the interrupt reaches the package manager, the launcher and every service at once.
      const interrupted = performance.now();
      process.kill(-run.group, 'SIGINT');
      const outcome = await exitOf(run);
      const stoppedAfter = performance.now() - interrupted;

      expect(outcome).toEqual({ code: 0, signal: null });
      expect(stoppedAfter).toBeLessThan(20_000);
      expect(await gatewayHealth()).toBeNull();
      // The doors closed with the rest: nothing listens where they were.
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

      process.kill(-run.group, 'SIGINT');
      const outcome = await exitOf(run);

      expect(outcome).toEqual({ code: 0, signal: null });
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
