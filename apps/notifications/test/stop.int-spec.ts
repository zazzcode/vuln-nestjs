import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { ExpressAdapter } from '@nestjs/platform-express';
import {
  runSecret,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../src/app.module.js';
import { WebhookReceiver } from './support/receiver.js';
import { StandInListener } from './support/stand-in.js';

// AC15: the service and every listener its tests start stop cleanly.
// Nothing listens on 3103 or 4010 afterwards, no stand-in answers, and no
// temporary directory a test created remains. The service's own stop()
// already throws when a database process or a temporary directory appears
// that was not there before the start; these checks are the rest.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let receiver: WebhookReceiver;
let standIn: StandInListener;
let markerDirectory: string;
let stopped = false;

/** True while something still accepts connections on the port. */
function portAnswers(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host, timeout: 1_000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** The stop: the stand-in, the receiver, the temporary directory, the service. */
async function stopEverything(): Promise<void> {
  if (stopped) {
    return;
  }
  stopped = true;
  await standIn?.close();
  await receiver?.close();
  await rm(markerDirectory, { recursive: true, force: true });
  await service?.stop();
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port: 3103,
  });
  receiver = WebhookReceiver.forSecret(JWT_SECRET);
  await receiver.listen();
  standIn = await StandInListener.start();
  markerDirectory = await mkdtemp(join(tmpdir(), 'vcx-stop-'));
  await writeFile(
    join(markerDirectory, 'zazzles-lab-marker'),
    'zazzles-lab-marker',
  );
}, 300_000);

afterAll(stopEverything);

describe('the service stops and leaves nothing behind', () => {
  test('every listener of this suite answered while it ran', async () => {
    // The premise of the checks below: these ports answered before the stop.
    expect(await portAnswers(3103)).toBe(true);
    expect(await portAnswers(4010)).toBe(true);
    expect(await portAnswers(standIn.port)).toBe(true);
  });

  test('after the stop, nothing listens on 3103, on 4010, or for the stand-in', async () => {
    await stopEverything();

    expect(await portAnswers(3103)).toBe(false);
    expect(await portAnswers(4010)).toBe(false);
    expect(await portAnswers(standIn.port)).toBe(false);
  });

  test('no temporary directory this suite created remains', async () => {
    await stopEverything();

    expect(existsSync(markerDirectory)).toBe(false);
  });
});
