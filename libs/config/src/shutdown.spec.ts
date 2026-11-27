import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stopOnSignal } from './shutdown.js';

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

describe('stopOnSignal', () => {
  /** Every exit the handler asked for, in order: one argument list each. */
  let exits: (number | undefined)[][];
  let closes: number;
  let detach: () => void;

  /** Registers the handler around a close that stays open until the test releases it. */
  const holdOnClose = (outcome: 'finishes' | 'fails' = 'finishes') => {
    detach = stopOnSignal(
      {
        close: vi.fn(async () => {
          closes += 1;
          // Another signal of the process stands in for "the close has finished".
          await new Promise<void>((resolve, reject) => {
            process.once('SIGUSR2', () =>
              outcome === 'finishes'
                ? resolve()
                : reject(new Error('a store did not stop')),
            );
          });
        }),
      },
      signals,
    );
  };

  beforeEach(() => {
    exits = [];
    closes = 0;
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exits.push([code]);
    }) as never);
    holdOnClose();
  });

  afterEach(() => {
    detach();
    vi.restoreAllMocks();
  });

  // A terminal delivers the interrupt to every service, and the launcher sends its own right after.
  test('closes the application once, however many signals arrive while it is closing', async () => {
    process.emit('SIGINT', 'SIGINT');
    process.emit('SIGINT', 'SIGINT');
    process.emit('SIGTERM', 'SIGTERM');
    process.emit('SIGUSR2', 'SIGUSR2');
    await new Promise((done) => setImmediate(done));

    expect(closes).toBe(1);
    expect(exits).toEqual([[0]]);
  });

  test('exits 1 when the close failed', async () => {
    detach();
    holdOnClose('fails');

    process.emit('SIGTERM', 'SIGTERM');
    process.emit('SIGUSR2', 'SIGUSR2');
    await new Promise((done) => setImmediate(done));

    expect(exits).toEqual([[1]]);
  });

  test('asks for nothing before a signal arrives', () => {
    expect(closes).toBe(0);
    expect(exits).toEqual([]);
  });

  test('stops listening once detached', () => {
    const before = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    };

    detach();

    expect(process.listenerCount('SIGINT')).toBe(before.SIGINT - 1);
    expect(process.listenerCount('SIGTERM')).toBe(before.SIGTERM - 1);
  });
});
