import type { GraphQLFormattedError } from 'graphql';

/** The code a GraphQL error carries in `extensions.code`, by the status of the exception behind it. */
const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'BAD_USER_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BAD_USER_INPUT',
  503: 'SERVICE_UNAVAILABLE',
};

export function errorCodeFor(status: number): string {
  return CODE_BY_STATUS[status] ?? 'INTERNAL_SERVER_ERROR';
}

/**
 * The `formatError` option of every subgraph, so that a client reads the same
 * reason everywhere, in `extensions.code`.
 *
 * The driver has already turned an `HttpException` into a GraphQL error by the
 * time this runs: with a code for four statuses only, and for any other with
 * `status` in the extensions and the code `INTERNAL_SERVER_ERROR`. This
 * finishes the mapping: a missing record is `NOT_FOUND`, a request the state
 * does not allow is `CONFLICT`, invalid input is `BAD_USER_INPUT`.
 *
 * It runs where the response is written, so it covers every resolver,
 * including the field and reference resolvers the global guards never reach.
 */
export function formatGraphQLError(
  formattedError: GraphQLFormattedError,
): GraphQLFormattedError {
  const extensions = formattedError.extensions ?? {};
  const status = extensions.status;
  const code =
    typeof status === 'number'
      ? errorCodeFor(status)
      : extensions.code === 'BAD_REQUEST'
        ? 'BAD_USER_INPUT'
        : extensions.code;
  return { ...formattedError, extensions: { ...extensions, code } };
}
