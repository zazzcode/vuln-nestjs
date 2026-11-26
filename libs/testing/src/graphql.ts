import { request } from './request.js';

export interface GraphQLErrorShape {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse {
  status: number;
  data?: Record<string, unknown> | null;
  errors?: GraphQLErrorShape[];
}

/** One GraphQL operation over HTTP: a `POST` with `query` and `variables`. */
export async function graphql(
  url: string,
  query: string,
  options: {
    variables?: Record<string, unknown>;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<GraphQLResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...options.headers,
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  const response = await request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: options.variables }),
  });
  return (await response.json()) as GraphQLResponse;
}

/** The `extensions.code` of the first error, which is how the lab says why an operation was refused. */
export function errorCode(response: GraphQLResponse): string | undefined {
  const code = response.errors?.[0]?.extensions?.code;
  return typeof code === 'string' ? code : undefined;
}
