import { FastifyAdapter } from '@nestjs/platform-fastify';
import { administrator, labUsers } from '@zazzles/exchange-lab-data';
import {
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../src/app.module.js';

/** The service under test, started the way every file in this directory starts it. */
export interface Lab {
  service: ServiceHandle;
  url: string;
  jwtSecret: string;
  serviceToken: string;
  /** Alice's and the administrator's tokens, minted as the run's own runner mints them. */
  aliceToken: string;
  bobToken: string;
  adminToken: string;
}

export type LabUser = (typeof labUsers)[number];

export async function startLab(): Promise<Lab> {
  process.env.JWT_SECRET ??= runSecret();
  process.env.INTERNAL_SERVICE_TOKEN ??= runSecret();
  const service = await startService({
    module: AppModule,
    adapter: () => new FastifyAdapter({ http2: true }),
    port: 3101,
  });
  const jwtSecret = process.env.JWT_SECRET as string;
  return {
    service,
    url: service.url,
    jwtSecret,
    serviceToken: process.env.INTERNAL_SERVICE_TOKEN as string,
    aliceToken: tokenFor(jwtSecret, userById('u-alice')),
    bobToken: tokenFor(jwtSecret, userById('u-bob')),
    adminToken: tokenFor(jwtSecret, administrator),
  };
}

export function userById(id: string): LabUser {
  const user = labUsers.find((candidate) => candidate.id === id);
  if (user === undefined) {
    throw new Error(`No fake user ${id}`);
  }
  return user;
}

export function tokenFor(secret: string, user: LabUser): string {
  return sessionToken(secret, {
    sub: user.id,
    sid: `s-${user.id}`,
    role: user.role,
  });
}

export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

/** The access token a sign-in answered, or a clear failure when it did not. */
export async function signInFor(
  lab: Lab,
  email: string,
  password: string,
): Promise<string> {
  const response = await gql(
    lab,
    'mutation ($email: String!, $password: String!) { signIn(email: $email, password: $password) { accessToken user { id } } }',
    { variables: { email, password } },
  );
  if (response.errors !== undefined) {
    throw new Error(`signIn failed: ${JSON.stringify(response.errors)}`);
  }
  return (response.data as { signIn: { accessToken: string } }).signIn
    .accessToken;
}

/** One GraphQL operation against the service. */
export function gql(
  lab: Lab,
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) {
  return graphql(`${lab.url}/graphql`, source, options);
}

/** One HTTP call against the service, over the transport its listener speaks. */
export function call(
  lab: Lab,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  } = {},
) {
  return request(`${lab.url}${path}`, {
    ...init,
    body: init.body === undefined ? undefined : (init.body as BodyInit),
  });
}

/** A multipart body carrying one file, as an upload sends it. */
export function multipart(
  field: string,
  filename: string,
  contents: string | Buffer,
  contentType = 'application/octet-stream',
): { headers: Record<string, string>; body: Buffer } {
  const boundary = `----vcx${crypto.randomUUID().replace(/-/g, '')}`;
  const parts: Buffer[] = [];
  parts.push(
    Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="${field}"; filename="${filename}"\r\ncontent-type: ${contentType}\r\n\r\n`,
    ),
  );
  parts.push(Buffer.from(contents));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts),
  };
}
