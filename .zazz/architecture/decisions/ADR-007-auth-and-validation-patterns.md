# ADR-007 — Established authentication and validation patterns

**Status:** Accepted by the Project Owner on 2026-11-26
**Date:** 2026-11-26

## Context

The functional baseline needs authentication, authorization and input validation. NestJS 12 offers two generations of each, and the choice decides what a scanner sees.

## Decision

Use the established patterns.

| Concern | Pattern |
| --- | --- |
| Tokens | `@nestjs/jwt` (`JwtService`) for HS256 access tokens |
| Authentication | A global guard that verifies the token, an `@Public()` marker through `Reflector` metadata, and an `@CurrentUser()` parameter decorator |
| Authorization | An `@Roles()` decorator with a roles guard, plus ownership checks inside services |
| Validation | `@InputType()` and DTO classes with class-validator, through a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` |

## Options considered

| Option | Why not |
| --- | --- |
| `@nestjs/authentication` and `@nestjs/authorization` | First-party, and what the NestJS 12 tutorial teaches. Both are at 0.1.x. A scanner is unlikely to model a package that young, so findings against it would say little about real code |
| Passport with `passport-jwt` | Widely used, and more machinery than the lab needs. It can be a later variant |
| Zod schemas with `StandardSchemaValidationPipe` | The other NestJS 12 path. Class DTOs keep validation next to the GraphQL types and make the mass-assignment counterpart explicit |

## Consequences

- The baseline uses patterns that are in most NestJS codebases, so a scanner's result against the lab says something about its result against them.
- The mass-assignment scenario (ACCESS-004) has a clear counterpart: the same DTO without `whitelist` lets the `role` property through.
- The newer packages stay available as an optional variant later. Open question Q4 in the [project plan](../../project/project-plan.md#10-open-questions).

## Verified facts

Checked on 2026-11-26.

- `@nestjs/authentication` is at 0.1.8 and `@nestjs/authorization` at 0.1.4.
- `@nestjs/jwt` 12.0.5 depends on `jsonwebtoken` 9.0.3.
- `class-validator` 0.15.1 and `class-transformer` 0.5.1 are the latest and have no advisory at those versions.
