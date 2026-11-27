import type { INestApplication } from '@nestjs/common';

/**
 * Stops the application when the process is interrupted.
 *
 * The first signal starts one close, which stops the store's engine before it
 * closes the listener. A later signal is ignored: when a person interrupts the
 * lab from a terminal, every service receives that signal and then the one the
 * launcher sends, and a second signal arriving mid-close could cut the close
 * short and leave an engine running.
 *
 * With the close finished well, the process exits 0; with it failed, 1.
 */
export function stopOnSignal(
  app: Pick<INestApplication, 'close'>,
  signals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'],
): () => void {
  let closing: Promise<void> | undefined;
  const stop = (): Promise<void> =>
    (closing ??= app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    ));
  for (const signal of signals) {
    process.on(signal, stop);
  }
  return () => {
    for (const signal of signals) {
      process.off(signal, stop);
    }
  };
}
