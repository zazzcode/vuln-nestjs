import type { GraphQLFormattedError } from 'graphql';
import { errorCodeFor, formatGraphQLError } from './errors.js';

// What the driver hands the formatter for an exception it does not map itself.
const withStatus = (status: number): GraphQLFormattedError => ({
  message: 'There is no order 99',
  extensions: {
    code: 'INTERNAL_SERVER_ERROR',
    status,
    originalError: { statusCode: status, message: 'There is no order 99' },
  },
});

const codeOf = (formattedError: GraphQLFormattedError): unknown =>
  formatGraphQLError(formattedError).extensions?.code;

describe('formatGraphQLError', () => {
  // The API promises a client these codes. The driver alone answers INTERNAL_SERVER_ERROR for each.
  it.each([
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('names a %i as %s', (status, code) => {
    expect(codeOf(withStatus(status))).toBe(code);
  });

  it('names invalid input BAD_USER_INPUT, whatever status the driver gave it', () => {
    expect(codeOf(withStatus(400))).toBe('BAD_USER_INPUT');
    expect(codeOf(withStatus(422))).toBe('BAD_USER_INPUT');
    expect(
      codeOf({
        message: 'email must be an email',
        extensions: { code: 'BAD_REQUEST' },
      }),
    ).toBe('BAD_USER_INPUT');
  });

  it('keeps the codes the driver already sets, and those of GraphQL itself', () => {
    for (const code of [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'GRAPHQL_VALIDATION_FAILED',
      'INTERNAL_SERVER_ERROR',
    ]) {
      expect(codeOf({ message: 'x', extensions: { code } })).toBe(code);
    }
  });

  it('names any other status an internal error', () => {
    expect(errorCodeFor(500)).toBe('INTERNAL_SERVER_ERROR');
    expect(errorCodeFor(418)).toBe('INTERNAL_SERVER_ERROR');
  });

  it('changes the code and nothing else', () => {
    const locations = [{ line: 1, column: 3 }];
    const originalError = { statusCode: 404, message: 'There is no order 99' };
    const stacktrace = ['GraphQLError: There is no order 99'];

    expect(
      formatGraphQLError({
        message: 'There is no order 99',
        path: ['order'],
        locations,
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
          status: 404,
          originalError,
          stacktrace,
        },
      }),
    ).toEqual({
      message: 'There is no order 99',
      path: ['order'],
      locations,
      extensions: { code: 'NOT_FOUND', status: 404, originalError, stacktrace },
    });
  });
});
