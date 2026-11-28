# `gateway` — service specification

**Adapter:** Fastify, HTTP/1.1 on `127.0.0.1:3000` · **Store:** none
**Status:** design agreed with the Project Owner on 2026-11-26. Ready to build.

## 1. What it owns

Four things, and no business logic.

1. **The federated graph** at `POST /graphql`. An Apollo gateway that composes the three subgraphs at start and forwards each request to the service that owns the field.
2. **REST pass-through.** One NestJS controller per feature, listed in section 4. Each validates nothing more than the caller, forwards the request to a service's `/internal/*` path, and returns what the service answered.
3. **Its own REST endpoints.** Health, reset, the status and ticker pages, the OpenAPI document, diagnostics, the post-sign-in redirect.
4. **The edge's security middleware.** Security headers, CORS, the exception filter that masks errors, the rate limit on sign-in.

It is the only listener a client uses. It calls no service on another service's behalf.

## 2. How the graph is served

| Setting | Value | Why |
| --- | --- | --- |
| Composition | `IntrospectAndCompose` at start | The application lives for minutes and starts with one command |
| Transport | A property of the service, from the service registry: HTTP/2 for `accounts` and `trading`, HTTP/1.1 for `notifications` | `IntrospectAndCompose` has no fetcher per subgraph. Schema discovery and every query go through the data source built in `buildService`, so the transport is decided there once |
| Headers forwarded | `authorization`, `cookie` | Nothing else crosses |
| Subscriptions | None | The Apollo gateway does not forward them |

## 3. How the edge is set

The gateway's own default configuration is weak on purpose. A local sample that lives for minutes has no reason to switch developer conveniences off, and they are worth testing a scanner against. They are registered as scenarios in section 5, each with the hardened value written beside it.

### Route scopes

| Scope | Security headers | CORS | Holds |
| --- | --- | --- | --- |
| Default | `@fastify/helmet` | none, so a browser refuses a cross-origin read | `/api/v1/health`, `/api/v1/status`, `/api/v1/markets/*`, `/api/v1/partner/*`, the pass-through |
| `/api/v1/public/*` | off | any origin reflected, with credentials — first planned as `@fastify/cors` with `origin: true` and `credentials: true`; built as three headers written by hand, see below | The three public endpoints in section 4 |

The `public` scope is an `onRequest` hook on the root instance, gated on the `/api/v1/public` prefix, which is how a small part of an application ends up with weaker settings than the rest. It was first planned as a Fastify plugin registered with a prefix, answering CORS through `@fastify/cors`. A plugin registered with a prefix does not reach the routes the root instance holds, where Nest's controllers are, so its hooks never fired for them: observed on 2026-11-27 and recorded in [002d-gateway.md](../../specifications/002d-gateway.md), section 13. What the table asks of the scope is unchanged.

## 4. API

### Its own endpoints

| Method and path | Kind | Caller | Scenario | What it does |
| --- | --- | --- | --- | --- |
| `GET /api/v1/health` | safe | public | | Every service and its store. No versions, no environment values |
| `GET /api/v1/status` | safe | public | | A status page. Security headers set by hand: CSP, `nosniff`, frame options |
| `GET /api/v1/status.json` | safe | public | | The same, as JSON |
| `GET /api/v1/markets/ticker` | safe | public | | The five reference prices, from `trading`. An error is masked |
| `GET /api/v1/partner/ticker` | safe | public | | The same, with CORS limited to the origins in `PARTNER_ORIGINS`. An unknown origin is not echoed. An error carries a request id |
| `GET /api/v1/admin/diagnostics` | safe | admin | | Versions, and an allowlist of environment keys |
| `GET /api/v1/admin/openapi.json` | safe | admin | | The OpenAPI document |
| `GET /api/v1/openapi.json` | safe | service token | | The OpenAPI document |
| `GET /api/v1/auth/continue` | safe | user | | Redirects to a fixed relative path |
| `GET /api/v1/auth/continue-allowlisted` | safe | user | | Redirects only to an origin in `REDIRECT_ORIGINS` |
| `POST /api/v1/profile/preferences/json` | safe | user | | Pass-through to `PUT /internal/profile`. Needs `Authorization` and `application/json`, which a cross-site form cannot send |
| `POST /api/v1/profile/preferences/csrf` | safe | user | | Pass-through to `PUT /internal/profile`. Needs `x-csrf-token`, through `@fastify/csrf-protection` |
| `POST /api/v1/lab/reset` | safe | public | | Calls `/internal/lab/reset` on every service. Lab tooling, open by design |
| `GET /api/v1/public/ticker` | vulnerable | public | CONFIG-001 | CORS reflects any origin, with credentials |
| `GET /api/v1/public/status` | vulnerable | public | CONFIG-002, XSS-003 | No security headers. `?name=` is echoed into the HTML unescaped |
| `GET /api/v1/public/diagnostics` | vulnerable | public | INFO-002 | An error's message and stack |
| `GET /docs`, `GET /docs/json` | vulnerable | public | CONFIG-003 | The OpenAPI document, with no authentication |
| `GET /api/v1/debug` | vulnerable | public | CONFIG-004 | Environment values and dependency versions |
| `GET /api/v1/auth/redirect?next=` | vulnerable | user | REDIR-001 | Redirects to `next`, wherever it points |
| `POST /api/v1/profile/preferences` | vulnerable | user, by cookie | COOKIE-003 | Pass-through to `PUT /internal/profile`. Cookie authentication, a form body accepted, no CSRF token |
| `POST /graphql`, `GET /graphql` | vulnerable | public | GQL-001 to GQL-004 | See section 5 |

### Pass-through controllers

One module per upstream feature, under `apps/gateway/src/passthrough/`. The paths, the kind of each route and the scenarios are defined in the service specifications. The gateway adds nothing to them.

| Upstream | Modules | Routes from |
| --- | --- | --- |
| `accounts` | `auth`, `profile`, `documents`, `users`, `admin-users` | [accounts.md, section 4](accounts.md#4-api) |
| `trading` | `admin`, `wallets`, `orders`, `reports` | [trading.md, section 4](trading.md#4-api) |
| `notifications` | `webhooks`, `alerts`, `announcements`, `deliveries` | [notifications.md, section 4](notifications.md#4-api) |

**Counts.** 13 scenarios on 8 vulnerable endpoints and one deployment-level setting. 13 safe endpoints of its own. The pass-through routes are counted in the service specifications. The gateway is the one place where the ratio is about one to one, because five of its scenarios are settings a process cannot have twice.

## 5. Scenarios

### `GQL` — GraphQL itself

Process-wide settings. Each has no twin: the application cannot run both values at once. The tests assert the exploit, and the hardened value is recorded here.

| ID | Weakness (CWE) | Where | Hardened value |
| --- | --- | --- | --- |
| GQL-001 | Introspection and the GraphiQL IDE are served to anyone (CWE-200) | `introspection: true`, `graphiql: true` | both `false` |
| GQL-002 | No depth or complexity limit. `me { orders { user { orders { user { … } } } } }` is accepted to any depth (CWE-770) | no `validationRules` | a depth rule with a limit of 5 |
| GQL-003 | Batched requests. One HTTP request carries an array of operations, which is how a brute force fits in a single call (CWE-307) | `allowBatchedHttpRequests: true` | `false` |
| GQL-004 | A stack trace in every error, under `extensions.stacktrace` (CWE-209) | `includeStacktraceInErrorResponses: true` | `false` |
| GQL-007 | The backend services answer the federation queries `_entities` and `_service` to any caller. A direct call to `127.0.0.1:3101` with `_entities` reads any user by key, though `user(id)` is admin only (CWE-306) | The subgraphs require no credential that proves the caller is the gateway | The gateway presents `x-internal-token`, and a subgraph requires it on `_entities` and `_service` |

Apollo Server includes the stack trace by default whenever `NODE_ENV` is not `production`. The spike of 2026-11-26 showed it: a validation error came back with the whole server stack. GQL-004 is therefore true from the first line of gateway code.

### `CONFIG` — security misconfiguration

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| CONFIG-001 | CORS reflects any origin and allows credentials, so any site can read the response in a signed-in browser (CWE-942) | `GET /api/v1/public/ticker` | `GET /api/v1/markets/ticker`: no CORS | `GET /api/v1/partner/ticker`: a static allowlist |
| CONFIG-002 | No security headers: no CSP, no `nosniff`, no frame options (CWE-693) | `GET /api/v1/public/status` | `GET /api/v1/health`: helmet on | `GET /api/v1/status`: the headers set by hand |
| CONFIG-003 | The OpenAPI document served with no authentication (CWE-200) | `GET /docs` | `GET /api/v1/admin/openapi.json`: admin only | `GET /api/v1/openapi.json`: service token |
| CONFIG-004 | A debug endpoint returns environment values and dependency versions (CWE-215) | `GET /api/v1/debug` | `GET /api/v1/health`: a status and nothing else | `GET /api/v1/admin/diagnostics`: admin only, allowlisted keys |

### `REDIR`, `XSS`, `COOKIE`, `INFO`

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| REDIR-001 | `reply.redirect(next)` with the caller's `next` (CWE-601) | `GET /api/v1/auth/redirect` | `GET /api/v1/auth/continue`: a fixed relative path | `GET /api/v1/auth/continue-allowlisted`: an allowlist of origins |
| XSS-003 | `?name=` written into the status page unescaped (CWE-79) | `GET /api/v1/public/status` | `GET /api/v1/status`: escaped | `GET /api/v1/status.json`: JSON, `nosniff` |
| COOKIE-003 | A state change that accepts cookie authentication and a form body, with no CSRF token. A page on another site can submit it (CWE-352) | `POST /api/v1/profile/preferences` | `POST …/preferences/json`: a bearer header and `application/json` | `POST …/preferences/csrf`: `x-csrf-token` |
| INFO-002 | An error's message and stack returned to the client (CWE-209) | `GET /api/v1/public/diagnostics` | `GET /api/v1/markets/ticker`: masked | `GET /api/v1/partner/ticker`: a request id, the stack logged |

## 6. API tests

The gateway is the one service that cannot be tested on its own: everything it does involves another service. Its tests run in two layers.

| Layer | What it proves |
| --- | --- |
| Unit, in `apps/gateway/test/` | The pass-through controllers forward what they were given and return what they received, with the internal client mocked. The route scopes carry the headers and the CORS settings their rows say |
| End to end, in `tests/e2e/`, with the whole lab running | The 13 scenarios, with their counterparts where there is one. A query that joins all three services. The gateway reached `accounts` and `trading` over `HTTP/2.0` and `notifications` over `HTTP/1.1`. Reset. A clean stop |

Harmless markers: an `Origin` header echoed back with `Access-Control-Allow-Credentials: true`; `<img src=x onerror="window.__zazzles='zazzles-lab-marker'">` in a `name` parameter, served unescaped; a redirect to `http://127.0.0.1:4010/landing` (an origin that is not on the allowlist); a cross-site-style form post that changes a preference.

## 7. Out of scope

Business logic, anything stored, a second GraphQL endpoint, subscriptions, anything that only matters for an application that stays up.
