import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServiceName } from '@zazzles/exchange-config';
import type { InternalClientService } from '../internal/internal-client.service.js';

/** What identifies the caller, and nothing else, crosses to the service. */
const CALLER_HEADERS: readonly string[] = ['authorization', 'cookie'];

function callerHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of CALLER_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') {
      headers[name] = value;
    }
  }
  return headers;
}

/** The query of a request, exactly as the caller wrote it. */
function rawQueryOf(request: FastifyRequest): string | undefined {
  const index = request.url.indexOf('?');
  return index === -1 ? undefined : request.url.slice(index + 1);
}

/**
 * Carries a request to the service that owns it, as it arrived, and returns
 * what that service answered: its status, its content type and its body. The
 * edge validates nothing here but the caller, which its guards have already
 * done by the time this runs. The method is the request's own unless the
 * route names the one the service's contract gives it.
 */
export async function forwardTo(
  internal: InternalClientService,
  service: ServiceName,
  request: FastifyRequest,
  reply: FastifyReply,
  path: string,
  method: string = request.method,
): Promise<void> {
  const answer = await internal.forward(service, method, path, {
    rawQuery: rawQueryOf(request),
    body: request.body as unknown,
    contentType: request.headers['content-type'],
    headers: callerHeaders(request),
  });
  if (answer.contentType) {
    void reply.header('content-type', answer.contentType);
  }
  void reply.code(answer.status).send(answer.body);
}
