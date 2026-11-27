import { Transform } from 'class-transformer';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';

/** Reads a numeric environment variable. `@IsInt()` and a range then check it. */
export const Integer = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? Number(value) : value));

/**
 * Checks a raw environment against a class of class-validator rules and returns
 * it as an instance of that class. Throws, naming every variable that is missing
 * or malformed. What `EnvironmentModule` runs at start.
 */
export function validateEnvironment<T extends object>(
  Environment: ClassConstructor<T>,
  environment: Record<string, string | undefined> = process.env,
): T {
  // A variable that is not set does not overwrite the default its property declares.
  const validated = plainToInstance(Environment, environment, {
    exposeUnsetFields: false,
  });
  const errors: ValidationError[] = validateSync(validated as object, {
    whitelist: true,
  });
  if (errors.length > 0) {
    const problems = errors.map(
      (error) =>
        `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return validated;
}
