import { Kind } from 'graphql';
import { clampLimit } from './pagination.js';
import { DateTimeScalar, DecimalScalar, JsonScalar } from './scalars.js';

const decimal = new DecimalScalar();
const dateTime = new DateTimeScalar();
const json = new JsonScalar();

describe('the Decimal scalar', () => {
  it('carries a decimal string through unchanged, in both directions', () => {
    for (const value of [
      '65000.00',
      '0.12',
      '-12.5',
      '100000000000',
      '0.00000001',
    ]) {
      expect(decimal.parseValue(value)).toBe(value);
      expect(decimal.serialize(value)).toBe(value);
    }
    expect(decimal.parseLiteral({ kind: Kind.STRING, value: '65000.00' })).toBe(
      '65000.00',
    );
  });

  // A float cannot hold money exactly, and nine fractional digits are more than a coin's smallest unit.
  it.each([65000.5, 0.1, '1e5', '0.123456789', 'abc', ''])(
    'refuses %j',
    (value) => {
      expect(() => decimal.parseValue(value as string)).toThrow(/Decimal/);
      expect(() => decimal.serialize(value as string)).toThrow(/Decimal/);
    },
  );

  it('refuses a literal that is not a string', () => {
    expect(() =>
      decimal.parseLiteral({ kind: Kind.INT, value: '65000' }),
    ).toThrow();
  });
});

describe('the DateTime scalar', () => {
  it('reads an ISO 8601 string into a Date, and writes a Date back as one, in UTC', () => {
    const read = dateTime.parseValue('2026-11-26T17:25:15.000Z');

    expect(read).toEqual(new Date('2026-11-26T17:25:15.000Z'));
    expect(dateTime.serialize(read)).toBe('2026-11-26T17:25:15.000Z');
  });

  it.each(['not a date', '', '17:25'])('refuses %j', (value) => {
    expect(() => dateTime.parseValue(value)).toThrow(/DateTime/);
  });

  it('refuses a literal that is not a string', () => {
    expect(() =>
      dateTime.parseLiteral({ kind: Kind.INT, value: '1' }),
    ).toThrow();
  });
});

describe('the JSON scalar', () => {
  it('passes any JSON value through unchanged: a resolver receives what the client sent', () => {
    const object = { role: 'ADMIN', nested: { limit: 1 } };

    expect(json.parseValue(object)).toBe(object);
    expect(json.serialize(object)).toBe(object);
    expect(json.parseLiteral({ kind: Kind.OBJECT, fields: [] })).toEqual({});
  });
});

describe('clampLimit', () => {
  it.each([
    [undefined, 50],
    [null, 50],
    [10, 10],
    [200, 200],
    [500, 200],
    [0, 1],
    [-3, 1],
    [12.7, 12],
  ])('turns %p into %p', (limit, expected) => {
    expect(clampLimit(limit)).toBe(expected);
  });
});
