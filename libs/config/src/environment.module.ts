import {
  Global,
  Module,
  ValidationPipe,
  type DynamicModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import type { ClassConstructor } from 'class-transformer';
import { validateEnvironment } from './environment.js';

/**
 * The typed environment of one application, and the pipe every application
 * validates its input with.
 *
 * Imported once, by the root module: `EnvironmentModule.forRoot(Environment)`.
 * The environment is checked when the application is created, so one that
 * fails its rules stops the service before it listens. The module is global:
 * whatever needs a value, in any module, injects the class:
 * `constructor(readonly environment: Environment)`.
 *
 * The check is deliberately not the `validate` option of `ConfigModule`. That
 * one runs when the module is defined, at import, before a test can set a
 * variable.
 */
@Global()
@Module({})
export class EnvironmentModule {
  static forRoot<T extends object>(
    Environment: ClassConstructor<T>,
  ): DynamicModule {
    return {
      module: EnvironmentModule,
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        {
          provide: Environment,
          // Defaults filled in, every rule checked: what the rest of the service reads.
          useFactory: () => validateEnvironment(Environment),
        },
        // Input that carries a property its type does not declare is refused, not ignored.
        {
          provide: APP_PIPE,
          useFactory: () =>
            new ValidationPipe({
              whitelist: true,
              forbidNonWhitelisted: true,
              transform: true,
            }),
        },
      ],
      exports: [Environment],
    };
  }
}
