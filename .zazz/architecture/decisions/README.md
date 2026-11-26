# Decision records

Each record is one decision that is expensive to reverse: what was chosen, what else was on the table, and what follows. A record is written when the decision is proposed and updated through review if implementation shows it is wrong. A decision is not reversed silently in a specification.

| Record | Decision | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-pnpm-workspace-monorepo.md) | One repository, a pnpm workspace, one package per service | Accepted 2026-11-26 |
| [ADR-002](ADR-002-apollo-federation-2-gateway.md) | Apollo Federation 2 with the `ApolloGatewayDriver`, not Mercurius | Accepted 2026-11-26 |
| [ADR-003](ADR-003-http2-inside-http1-elsewhere.md) | HTTP/2 cleartext between the Fastify services; HTTP/1.1 at the edge and to the Express service | Accepted 2026-11-26 |
| [ADR-004](ADR-004-ephemeral-stores.md) | Ephemeral stores, because the application is started, seeded and stopped | Accepted 2026-11-26 |
| [ADR-005](ADR-005-three-services-one-store-each.md) | Three backend services, each the only user of its store | Accepted 2026-11-26 |
| [ADR-006](ADR-006-express-adapter-for-notifications.md) | The `notifications` service uses the Express adapter | Accepted 2026-11-26 |
| [ADR-007](ADR-007-auth-and-validation-patterns.md) | Established authentication and validation patterns | Accepted 2026-11-26 |
| [ADR-008](ADR-008-safe-baseline-then-deliberate-flaws.md) | Safe functional baseline first, deliberate flaws as twin operations, about two safe for every vulnerable one | Accepted 2026-11-26 |
| [ADR-009](ADR-009-vulnerable-pins-one-workspace.md) | Vulnerable pins, one workspace each, guarded by an audit snapshot | Accepted 2026-11-26 |
| [ADR-010](ADR-010-services-never-call-each-other.md) | Services never call each other. The gateway and the client orchestrate | Accepted 2026-11-26 |

## Format

Every record has the same sections: **Status** and **Date**, **Context**, **Decision**, **Options considered**, **Consequences**, and where it matters **Verified facts**, which say what was checked, how, and on which date. A fact in that section goes stale; the decision should not depend on it being current without saying so.
