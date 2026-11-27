# ADR-012 — An HTTP/1.1 relay in front of each service on HTTP/2

**Status:** Proposed by the lead agent on 2026-11-26, at the Project Owner's request. The Project Owner chose the name "relay" the same day. Open for review in [pull request 2](https://github.com/zazzcode/vuln-nestjs/pull/2).
**Date:** 2026-11-26

## Context

ADR-003 put HTTP/2 cleartext between the gateway and `accounts` and `trading`, and HTTP/1.1 at the edge, so that curl, Postman, Newman and Burp can drive the lab through the gateway.

On 2026-11-26 the Project Owner asked for two things more: Postman and Newman tests that exercise the routes from the gateway, and API tests for each microservice. A microservice is called on its own address. For `accounts` and `trading` that address speaks only HTTP/2 cleartext, which none of those tools can send. Two errors say so, both produced on 2026-11-26:

- Newman, sent straight at `accounts`: `Parse Error: Expected HTTP/, RTSP/ or ICE/`. It exits 1.
- curl, the same: `curl: (1) Received HTTP/0.9 when not allowed`.

The owner then named three other tools, each of which was checked before anything was built:

| Tool | Cleartext HTTP/2 | What it would have cost |
| --- | --- | --- |
| Insomnia | Yes: one setting for the whole application, "Preferred HTTP version: HTTP/2 PriorKnowledge" | No per-request choice, so a session speaks HTTP/2 to everything or to nothing. Its command-line runner was not examined |
| Pororoca | Not stated in the pages of its documentation that were read | Its automated tests run on .NET, a second toolchain in a pnpm repository |
| HTTPie | Not stated in the pages of its documentation that were read | A caller with no assertions of its own; it is not a test runner |

The owner's requirement named Postman and Newman, and [FR-9.4](../../project/requirements.md) names them too.

## Decision

The start command opens one relay in front of each service on HTTP/2: `accounts` on `127.0.0.1:3201`, `trading` on `127.0.0.1:3202`. Each is `scripts/relay.mjs`, under two hundred lines with its comments, on Node's own modules alone.

A relay:

- listens on `127.0.0.1` and speaks HTTP/1.1;
- carries each request to its service over HTTP/2 with prior knowledge, and streams the answer back;
- decides nothing. The method, the path, the headers and the body are the caller's; the status, the headers and the body are the service's. What belongs to one connection, the hop-by-hop headers, does not cross. The caller's `Host` does not cross either: the service is asked for its own address, as the gateway asks it;
- opens before its service and closes before anything else stops;
- answers 502, in the lab's error shape, when its service does not answer.

On the strength of the relays, the Postman collections are one per microservice, each in its own folder under `postman/`, beside the gateway's. `pnpm test:api` starts the lab and runs every one under Newman.

## Options considered

| Option | Why not |
| --- | --- |
| Every service on HTTP/1.1 | Reverses ADR-003, which the Project Owner asked for, and takes the HTTP/2 coverage out of the lab |
| TLS everywhere, so that the tools negotiate HTTP/2 | Rejected in ADR-003: a certificate lifecycle for an application that is discarded |
| A second listener, on HTTP/1.1, inside each Fastify service | One port per service is a principle of the service communication, and a service would then speak two protocols, where the end-to-end suite proves it speaks exactly one |
| A forward proxy, configured in each tool | Every tool needs the setting. A relay needs nothing: its address is used where the service's would be |
| Another tool: Insomnia, Pororoca, HTTPie | Each would leave Postman and Newman behind, which the requirement and FR-9.4 name |
| A relay in the launcher's own process | Chosen. The services are untouched, and a relay is there whenever the lab is |

## Consequences

- **Principle 2 of the service communication is amended.** The application's client still uses one address, the gateway's. A relay is for a tool that calls a service directly, which the communication already allowed for.
- **The lab has six listeners, not four.** All on `127.0.0.1`. The end-to-end suite fails unless every relay is closed once the lab has stopped.
- **A service cannot tell that a request arrived through a relay.** It arrives over HTTP/2, for the service's own address. What a direct caller gains is what it gained before: the federation queries `_entities` and `_service`, which is scenario GQL-007.
- **One connection to the service per request.** Nothing is multiplexed. For a lab that is exercised by hand and by test runs, that is the simpler thing to prove closed.
- **A relay is part of the lab's runtime, not of the application a scanner scans.** A scanner given a relay's address scans the service, through it.
- **The services' own listeners are unchanged.** `accounts` and `trading` still answer HTTP/2 and nothing else; the end-to-end suite proves it.

## Verified facts

Checked on 2026-11-26.

- Twelve unit tests run a relay against a stand-in service on HTTP/2: a JSON body, a request without one, a body larger than one packet in both directions, a body sent in chunks, an answer that comes in pieces, hop-by-hop headers including those that `connection` names, a 502 when nothing answers, a caller that goes away before the answer is over, loopback only, a close that does not wait for an idle caller and releases its port, and a clear failure when the port is taken.
- Each of the two cleanup tests was checked both ways: with the line of the relay it guards removed it fails, with the line in place it passes.
- In the end-to-end suite, against the real services: the relays answer HTTP/1.1 and nothing else; each reaches its service; a query and its caller's token are carried, so that the service refuses a caller it is not given and answers the one it is; a relay answers 502 once its service is gone; no relay answers on the IPv6 loopback address or on an address of the network; and after the lab stops nothing listens where a relay was, in the test process and in the start command run as a person runs it.
- By hand, with curl: `--http2-prior-knowledge` to `accounts` is answered `HTTP/2 200`; plain HTTP/1.1 to the relay is answered `HTTP/1.1 200 OK`. Under Newman: straight at `accounts`, the parse error above; through the relay, `200 OK`.
