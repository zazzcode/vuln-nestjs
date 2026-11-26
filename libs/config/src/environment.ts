import { Transform } from 'class-transformer';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';

/** Reads a numeric environment variable. `@IsInt()` and a range then check it. */
export const Integer = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? Number(value) : value));

/**
 * Checks a raw environment against a class of class-validator rules and returns
 * it filled. Throws, naming every variable that is missing or malformed: a
 * service with an invalid environment stops before it listens.
 *
 * Meant for `validate` in `ConfigModule.forRoot`.
 */
export function validateEnvironment<T extends object>(
  Environment: ClassConstructor<T>,
  environment: Record<string, string | undefined> = process.env,
): T {
  // Unset variables do not overwrite the defaults the class declares.
  const validated = plainToInstance(Environment, environment, {
    exposeUnsetFields: false,
  });
  const errors = validateSync(validated as object, { whitelist: true });
  if (errors.length > 0) {
    const problems = errors.map(
      (error) =>
        `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return validated;
}
