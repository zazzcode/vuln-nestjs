import { errorCodeFor, formatGraphQLError } from './errors.js';

// What the driver hands the formatter, for the exceptions it does not map itself.
const withStatus = (status: number) => ({
  message: 'There is no order 99',
  extensions: {
    code: 'INTERNAL_SERVER_ERROR',
    status,
    originalError: { statusCode: status, message: 'There is no order 99' },
  },
});

describe('formatGraphQLError', () => {
  // The lab's API promises a client these codes; the driver alone would answer INTERNAL_SERVER_ERROR for each.
  it.each([
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('names a %i as %s', (status, code) => {
    expect(formatGraphQLError(withStatus(status)).extensions?.code).toBe(code);
  });

  it('names invalid input BAD_USER_INPUT, whatever status the driver gave it', () => {
    expect(formatGraphQLError(withStatus(400)).extensions?.code).toBe(
      'BAD_USER_INPUT',
    );
    expect(formatGraphQLError(withStatus(422)).extensions?.code).toBe(
      'BAD_USER_INPUT',
    );
    expect(
      formatGraphQLError({
        message: 'email must be an email',
        extensions: { code: 'BAD_REQUEST' },
      }).extensions?.code,
    ).toBe('BAD_USER_INPUT');
  });

  it('keeps the codes the driver already sets, and those of GraphQL itself', () => {
    for (const code of [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'GRAPHQL_VALIDATION_FAILED',
      'INTERNAL_SERVER_ERROR',
    ]) {
      expect(
        formatGraphQLError({ message: 'x', extensions: { code } }).extensions
          .code,
      ).toBe(code);
    }
  });

  it('keeps everything else of the error, including what the scenario about stack traces needs', () => {
    const formatted = formatGraphQLError({
      message: 'There is no order 99',
      path: ['order'],
      locations: [{ line: 1, column: 3 }],
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        status: 404,
        stacktrace: ['GraphQLError: There is no order 99'],
      },
    });

    expect(formatted).toEqual({
      message: 'There is no order 99',
      path: ['order'],
      locations: [{ line: 1, column: 3 }],
      extensions: {
        code: 'NOT_FOUND',
        status: 404,
        stacktrace: ['GraphQLError: There is no order 99'],
      },
    });
  });

  it('maps every status of the contract', () => {
    expect(errorCodeFor(500)).toBe('INTERNAL_SERVER_ERROR');
  });
});
