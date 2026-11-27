import { createServer, type Server } from 'node:http';

/** The marker the stand-in answers with: what a request that reached it observes. */
export const STAND_IN_MARKER = 'zazzles-lab-marker';

/**
 * A listener the test starts on a port the system assigns, standing in for
 * another service's internal endpoint: it answers `/internal/health` with a
 * body that carries the marker, and records every request it saw. Request-forgery
 * payloads point at it, so the test observes the forged request arrive without
 * another service running.
 */
export class StandInListener {
  readonly server: Server;
  readonly url: string;
  private readonly received: {
    method: string;
    path: string;
    rawBody: string;
  }[] = [];

  private constructor(readonly port: number) {
    this.url = `http://127.0.0.1:${port}`;
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        this.received.push({
          method: request.method ?? '',
          path: request.url ?? '/',
          rawBody: Buffer.concat(chunks).toString('utf8'),
        });
        if ((request.url ?? '').startsWith('/internal/health')) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            `{"status":"ok","service":"stand-in","marker":"${STAND_IN_MARKER}"}`,
          );
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"status":"ok","service":"stand-in"}');
      });
    });
  }

  /** Starts the stand-in on a port the system assigns. Never 4010: that is the receiver's. */
  static async start(): Promise<StandInListener> {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as { address: string; port: number };
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
    if (port === 4010) {
      throw new Error("The stand-in must not take the receiver's port");
    }
    const standIn = new StandInListener(port);
    await standIn.listen();
    return standIn;
  }

  private listen(): Promise<void> {
    return new Promise<void>((resolve) =>
      this.server.listen(this.port, '127.0.0.1', resolve),
    );
  }

  /** Stops the stand-in. Nothing may be left listening. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }

  requests(): readonly { method: string; path: string; rawBody: string }[] {
    return [...this.received];
  }

  /** Forgets what it saw, so the next test observes only its own requests. */
  forget(): void {
    this.received.length = 0;
  }

  sawRequestTo(path: string): boolean {
    return this.received.some((request) => request.path === path);
  }
}
