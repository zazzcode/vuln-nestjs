/** The only address any listener of this application binds. */
export const LOOPBACK_HOST = '127.0.0.1';

type ListenerAddress =
  { address: string; family: string; port: number } | string | null;

/**
 * Throws unless a listener bound to `127.0.0.1`. Called by every service right
 * after `listen`, so a listener on another interface stops the service at once.
 */
export function assertLoopbackListener(address: ListenerAddress): void {
  const bound =
    address === null
      ? 'nothing'
      : typeof address === 'string'
        ? address
        : address.address;
  if (bound !== LOOPBACK_HOST) {
    throw new Error(
      `Refusing to serve on ${bound}: every listener of this application binds ${LOOPBACK_HOST}.`,
    );
  }
}
