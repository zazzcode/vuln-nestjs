# Architecture

The intended technical shape of the system. A specification links to the section it depends on instead of restating the design. If implementation shows a decision here is wrong, the document changes through review — one step does not silently fork the shape.

| Document | Holds |
| --- | --- |
| [project.md](project.md) | System context, the four services, communication and data ownership at a glance, cross-cutting concerns, the important flows, risks, the index of decisions |
| [service-communication.md](service-communication.md) | GraphQL federation, HTTP/2 inside and HTTP/1.1 at the edge, the internal REST contract, identity propagation, timeouts and failures |
| [data-architecture.md](data-architecture.md) | The three stores, entities, how money is represented, seed data, reset, transactions and where they stop |
| [api-design.md](api-design.md) | The federated schema and its entities, gateway REST endpoints, internal endpoints, errors, pagination, identifiers |
| [security-model.md](security-model.md) | Trust boundaries, the functional security baseline, the lab's safety rails, how a deliberate flaw is added |
| [testing-strategy.md](testing-strategy.md) | Test layers, tools, end-to-end topology, Postman and Newman, CI, ground truth |
| [repository-layout.md](repository-layout.md) | Workspace layout, tooling and verified versions, coding conventions |
| [decisions/](decisions/README.md) | Decision records: context, options, decision, consequences |

## Levels

These are project-level documents. Design that belongs to one deliverable — the exact fields of an input type, the exact steps of the matching loop — lives in the step's [specification](../specifications/README.md). The API of each service, which is feature-level design, lives in its [service specification](../project/services/README.md).
