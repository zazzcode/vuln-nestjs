import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { Integer, validateEnvironment } from './environment.js';

class Environment {
  @Integer()
  @IsInt()
  @Min(1)
  @Max(65535)
  ACCOUNTS_PORT = 3101;

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;
}

const secret = 's'.repeat(16);

describe('validateEnvironment', () => {
  it('refuses an environment without JWT_SECRET, naming the variable', () => {
    expect(() => validateEnvironment(Environment, {})).toThrow(/JWT_SECRET/);
  });

  it('refuses a secret that is too short, naming the variable', () => {
    expect(() =>
      validateEnvironment(Environment, { JWT_SECRET: 'short' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('fills in the default port', () => {
    expect(
      validateEnvironment(Environment, { JWT_SECRET: secret }).ACCOUNTS_PORT,
    ).toBe(3101);
  });

  it('reads a numeric variable as a number', () => {
    const environment = { JWT_SECRET: secret, ACCOUNTS_PORT: '4200' };

    expect(validateEnvironment(Environment, environment).ACCOUNTS_PORT).toBe(
      4200,
    );
  });

  it.each(['seven', '0', '70000', ''])(
    'refuses the port %j, naming the variable',
    (port) => {
      expect(() =>
        validateEnvironment(Environment, {
          JWT_SECRET: secret,
          ACCOUNTS_PORT: port,
        }),
      ).toThrow(/ACCOUNTS_PORT/);
    },
  );
});
