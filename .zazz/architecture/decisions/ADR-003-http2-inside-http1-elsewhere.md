# ADR-003 — HTTP/2 cleartext inside; HTTP/1.1 at the edge and to the Express service

**Status:** Proposed in Phase 0, waiting for review
**Date:** 2026-11-26

## Context

The Project Owner asked for HTTP/2 between the microservices. Two facts limit where it can go.

- The tools that will drive the lab — curl, Postman, Newman, Burp — negotiate HTTP/2 only over TLS, and the lab has no TLS.
- One service uses the Express adapter (ADR-006), and NestJS's Express adapter creates an HTTP/1.1 server.

The application is a sample that runs on one machine for minutes. That removes the usual reason for TLS inside a system: there is no network to protect.

## Decision

| Path | Protocol | Why |
| --- | --- | --- |
| Client → gateway | HTTP/1.1, cleartext | Every tool works without configuration |
| Gateway → `accounts`, → `trading` | HTTP/2, cleartext (h2c) | Both ends are ours and run Fastify |
| `trading` → `accounts` | HTTP/2, cleartext | The same |
| Gateway → `notifications`, `trading` → `notifications` | HTTP/1.1, cleartext | The Express service cannot speak HTTP/2 |

The transport is a property of the service, recorded once in the service registry. Callers do not decide it per call.

## Options considered

| Option | Why not |
| --- | --- |
| TLS with self-signed certificates, HTTP/2 everywhere | Every tool then needs the certificate trusted. The lab gains a certificate lifecycle and loses ease of use, for an application that is discarded |
| HTTP/2 cleartext at the edge | Newman, Postman and Burp do not offer it |
| gRPC for the internal calls | Runs on HTTP/2, but adds protobuf files and a third API paradigm beside the graph and REST |
| A NestJS microservices transport | None of the built-in transports is plain HTTP/2, and most need a broker |
| The Express service on Node's HTTP/2 compatibility server | A workaround on an API that Node documents as not to be relied on. HTTP/1.1 to one service is the honest trade for adapter coverage |

## Consequences

- An HTTP/2 client is written once, in `libs/http2`: a `fetch`-shaped function for the Apollo data source and a small JSON client for internal REST.
- Cleartext inside the machine is not a weakness here. It is registered as the negative control DEMO-005, so that a scanner reporting it can be recognized as wrong for this context.
- A test asserts the protocol: the gateway's fetches reach the Fastify subgraphs with `httpVersion` `"2.0"`, and reach `notifications` with `"1.1"`.

## Verified facts

Checked on 2026-11-26.

- `FastifyAdapter` passes its options to Fastify, which accepts `http2: true` for a cleartext HTTP/2 listener. Not yet run here; Phase 1 proves it.
- The Express adapter of NestJS 12.6.3 depends on `express` 5.3.0 and creates an HTTP/1.1 server.
