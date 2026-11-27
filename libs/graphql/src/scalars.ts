import { CustomScalar, Scalar } from '@nestjs/graphql';
import { GraphQLError, Kind, ValueNode, valueFromASTUntyped } from 'graphql';

const DECIMAL = /^-?\d{1,32}(\.\d{1,8})?$/;

function decimalString(value: unknown): string {
  if (typeof value !== 'string' || !DECIMAL.test(value)) {
    throw new GraphQLError(
      `Decimal is a decimal string such as "65000.00", with at most 8 fractional digits. Received ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function validDate(date: Date, received: unknown): Date {
  if (Number.isNaN(date.getTime())) {
    throw new GraphQLError(
      `DateTime is an ISO 8601 timestamp in UTC. Received ${JSON.stringify(received)}.`,
    );
  }
  return date;
}

/** Money and prices: a string on the wire, because a float cannot hold them exactly. */
@Scalar('Decimal')
export class DecimalScalar implements CustomScalar<string, string> {
  readonly description =
    'A decimal number as a string, such as "65000.00". Never a float.';

  parseValue(value: unknown): string {
    return decimalString(value);
  }

  serialize(value: unknown): string {
    return decimalString(value);
  }

  parseLiteral(ast: ValueNode): string {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('Decimal is written as a string.');
    }
    return decimalString(ast.value);
  }
}

/** An ISO 8601 string in UTC on the wire, a `Date` inside a resolver. */
@Scalar('DateTime')
export class DateTimeScalar implements CustomScalar<string, Date> {
  readonly description =
    'An ISO 8601 timestamp in UTC, such as "2026-11-26T17:25:15.000Z".';

  parseValue(value: unknown): Date {
    return validDate(new Date(value as string), value);
  }

  serialize(value: unknown): string {
    const date = value instanceof Date ? value : new Date(value as string);
    return validDate(date, value).toISOString();
  }

  parseLiteral(ast: ValueNode): Date {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('DateTime is written as a string.');
    }
    return validDate(new Date(ast.value), ast.value);
  }
}

/** Any JSON value: the only way an object reaches a resolver untyped. */
@Scalar('JSON')
export class JsonScalar implements CustomScalar<unknown, unknown> {
  readonly description =
    'Any JSON value: an object, an array, a string, a number, a boolean or null.';

  parseValue(value: unknown): unknown {
    return value;
  }

  serialize(value: unknown): unknown {
    return value;
  }

  parseLiteral(
    ast: ValueNode,
    variables?: Record<string, unknown> | null,
  ): unknown {
    return valueFromASTUntyped(ast, variables ?? undefined);
  }
}
