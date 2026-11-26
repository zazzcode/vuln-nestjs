# ADR-002 — Apollo Federation 2 with the Apollo gateway

**Status:** Accepted by the Project Owner on 2026-11-26
**Date:** 2026-11-26

## Context

The services have to expose one GraphQL schema, composed from parts that each service owns. NestJS has two first-party ways to do that, and the Project Owner asked for the Fastify adapter.

## Decision

Apollo Federation 2.

- Each backend service registers `ApolloFederationDriver` from `@nestjs/apollo`, code first, with `autoSchemaFile: { federation: 2 }`.
- The gateway registers `ApolloGatewayDriver` and composes the subgraphs at start with `IntrospectAndCompose`.
- The gateway reaches the subgraphs through a custom `RemoteGraphQLDataSource` so that it can choose the transport and forward an allowlist of headers.

## Options considered

| Option | Why not |
| --- | --- |
| Mercurius, through `@nestjs/mercurius` | Native to Fastify and fast, but the NestJS documentation states that it does not fully support Federation 2. Its gateway is a separate package again. A partial Federation 2 implementation limits which scenarios the lab can represent |
| Schema stitching | Superseded by federation. No first-party NestJS driver |
| One GraphQL service with no federation | Would not meet the requirement, and would remove the entity-resolution scenarios |
| Compose the supergraph ahead of time into a file, as the official NestJS sample does | Right for a deployed system. For an application that starts, runs and stops, composing at start removes a step and a generated file |

## Consequences

- Apollo Server 5, and one integration package per adapter: `@as-integrations/fastify` and `@as-integrations/express5`.
- No subscriptions through the gateway. The Apollo gateway does not forward them to subgraphs.
- The services must be up before the gateway starts. The launcher enforces the order.
- `graphql` is pinned to the 16.x line: `@apollo/server` 5.5.2 declares `^16.11.0` as its peer range.

## Verified facts

Checked on 2026-11-26 against the npm registry and the published typings of `@apollo/gateway` 2.14.5.

- `@nestjs/apollo` 14.2.2 exports `ApolloFederationDriver` and `ApolloGatewayDriver` and declares `@apollo/server` `^5.0.0` as a peer.
- `GatewayConfigBase` has `buildService`, through which a data source with a custom `fetcher` is supplied.
- `RemoteGraphQLDataSource` accepts a `fetcher` and exposes `willSendRequest`.
- `IntrospectAndCompose` and `LocalCompose` are exported.
- `IntrospectAndCompose` has no `fetcher` per subgraph. Schema discovery goes through the data source from `buildService`, so the transport is decided there once.
- An entity reference returned from a parent object needs `@provides(fields: "id")`, or composition fails.
- **Run on 2026-11-26.** A gateway on the Fastify adapter composed a Fastify subgraph and an Express subgraph, and answered a query that joins them. The Fastify subgraph received every gateway request over `HTTP/2.0`.
- Not verified by the spike: the code-first schema generator with TypeScript 6. The spike used schema-first definitions. The scaffolding uses code first and finds out.
