# ADR-006 — The notifications service uses the Express adapter

**Status:** Accepted in principle on 2026-11-26. Which service uses Express is the Project Owner's call; `notifications` is the default
**Date:** 2026-11-26

## Context

The Project Owner allowed one backend service to use Express instead of Fastify. The gateway stays on Fastify: sampling the Fastify framework was the original request.

## Decision

`notifications` uses `@nestjs/platform-express`, which pins Express 5.3.0. It listens on HTTP/1.1. The gateway, `accounts` and `trading` stay on the Fastify adapter, and HTTP/2 stays between them.

## Why take the option

- **Most NestJS applications run on Express**, because it is the adapter NestJS uses unless another is chosen. A scanner tested only against Fastify is tested against the minority.
- **The two adapters have different idioms** for the same job. Express: middleware, `res.render`, `res.cookie`, `Multer`. Fastify: hooks, `FastifyReply`, JSON-schema route validation. Each has patterns a scanner has to recognize.
- **For a sample application it costs nothing.** Nothing has to stay supported.

## Why `notifications`

- It keeps the gateway and the money path, `trading` to `accounts`, on Fastify with HTTP/2 between them. That is what the plan was first asked to sample.
- Its features use Express naturally: a JSON body parser as middleware, a NestJS middleware class, and announcements rendered with `res.render()` and `ejs`.
- It is the service with the fewest callers.

## Options considered

| Option | Why not |
| --- | --- |
| No service on Express | Loses the adapter coverage the Project Owner offered |
| `accounts` on Express | A good fit for Express idioms — cookie sign-in, form bodies, uploads, file download. But it moves the money path off HTTP/2, and it takes the upload and cookie scenarios away from Fastify |
| The gateway on Express | The gateway is where the Fastify framework is most on show. It stays on Fastify |
| HTTP/2 for `notifications` through Node's compatibility server | A workaround on an API Node documents as not to be relied on |

## Consequences

- One more package: `@as-integrations/express5`, for the Apollo subgraph on Express.
- The transport to `notifications` is HTTP/1.1 (ADR-003). The service registry records it.
- Integration tests for `notifications` create the application with the Express adapter, or they test a different stack.
- Express 5.3.0 has no published advisory, so Express is not a dependency target. The Fastify pin (SCA-008) lives in `trading`.
- Open question Q9 in the [project plan](../../project/project-plan.md#10-open-questions) keeps the choice visible for review.

## Verified facts

Checked on 2026-11-26.

- `@nestjs/platform-express` 12.6.3 depends on `express` 5.3.0, `multer` 2.5.0 and `cors` 2.8.6.
- Its `initHttpServer` creates an `http` or `https` server. There is no HTTP/2 path (source: `packages/platform-express/adapters/express-adapter.ts` on `master`).
- `@nestjs/apollo` 14.2.2 declares `@as-integrations/express5` `^1.1.2` as a peer. That package's latest is 1.1.2.
- The GitHub Advisory Database reports no advisory for `express` 5.3.0 or for `@nestjs/platform-express`.
