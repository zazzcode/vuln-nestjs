import { createServer, type Server } from 'node:http';
import {
  deriveSignatureKey,
  verifySignature,
} from '../../src/webhooks/webhook-signature.js';

/** One request the receiver saw: where it went, what it carried, whether its signature verified. */
export interface ReceivedRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  signatureVerified: boolean;
}

/**
 * The loopback test receiver the seeded webhooks point at: `127.0.0.1:4010`.
 * It records what it is sent and verifies the delivery signature against the
 * run's key. A test starts it and closes it; nothing of it remains.
 */
export class WebhookReceiver {
  readonly server: Server;
  private readonly received: ReceivedRequest[] = [];

  private constructor(private readonly key: Buffer) {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const signature = request.headers['x-vcx-signature'];
        this.received.push({
          path: request.url ?? '/',
          method: request.method ?? '',
          headers: { ...request.headers },
          rawBody,
          signatureVerified:
            typeof signature === 'string' &&
            verifySignature(rawBody, signature, this.key),
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"received":true}');
      });
    });
  }

  static forSecret(jwtSecret: string): WebhookReceiver {
    return new WebhookReceiver(deriveSignatureKey(jwtSecret));
  }

  /** Starts listening on the loopback test receiver's port. */
  async listen(port = 4010): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server.listen(port, '127.0.0.1', resolve),
    );
  }

  /** Stops the receiver. Nothing may be left listening. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }

  requests(): readonly ReceivedRequest[] {
    return [...this.received];
  }

  requestsTo(path: string): ReceivedRequest[] {
    return this.received.filter((request) => request.path === path);
  }

  reset(): void {
    this.received.length = 0;
  }
}
