# Specifications

One deliverable specification per step of the build. A specification is the contract for one bounded piece of work: it is written before the work starts, approved before implementation begins, and kept current while the work is done.

## What a service's specification is built from

Each service has two documents, and they answer different questions.

| Document | Answers | Where |
| --- | --- | --- |
| The **service specification** | What does the service do? What is its API? Which weaknesses does it contain, and what are their protected counterparts? | [`.zazz/project/services/`](../project/services/README.md) |
| The **deliverable specification** | Who builds it, on which branch, in which order? What are the acceptance criteria, the tests and the evidence? When must the implementor stop and ask? | this directory |

A deliverable specification never restates the API. It cites its service specification and adds the execution contract around it.

## Workflow

1. **Branch.** `git checkout -b phase-<n>-<slug>` from the step's base branch.
2. **Draft.** With the `spec-builder` skill ([`.agents/skills/spec-builder/`](../../.agents/skills/spec-builder/SKILL.md)), copy `regular-specification-template.md` from that skill into this directory as `<nnn>-<slug>.md` and fill it in. Commit it as the first commit on the branch and open the pull request as a draft.
3. **Greenlight.** The Project Owner approves the specification in the pull request, or asks for changes. No implementation starts before that.
4. **Implementation.** Work on the same branch. When implementation changes the contract, update the affected section in place and add an entry to the change log at the end of the specification.
5. **Review.** When the definition of done is met and the evidence is in the pull request, mark it ready. The Project Owner reviews and merges.
6. **Durable documents.** The same pull request updates the [implementation plan](../project/implementation-plan.md), the [architecture](../architecture/README.md), the [scenario catalogue](../project/scenario-catalog.md) and [`docs/`](../../docs/README.md) for whatever the change made untrue.

Specifications are committed Markdown, reviewed with the same pull request as the code.

## Index

The steps are defined in the [implementation plan](../project/implementation-plan.md#1-who-does-what).

| Specification | Step | Branch | Status |
| --- | --- | --- | --- |
| — the plan and the service specifications are this change | 0 — Plan, architecture, service specifications | `phase-0-plan-and-architecture` | Merged on 2026-11-26 in [pull request 1](https://github.com/zazzcode/vuln-nestjs/pull/1) |
| [`001-foundation.md`](001-foundation.md) | 1 — Scaffolding | `phase-1-foundation` | In implementation |
| `002a-accounts.md` | 2a — The `accounts` service | `phase-2a-accounts` | Planned |
| `002b-trading.md` | 2b — The `trading` service | `phase-2b-trading` | Planned |
| `002c-notifications.md` | 2c — The `notifications` service | `phase-2c-notifications` | Planned |
| `002d-gateway.md` | 2d — The `gateway` service | `phase-2d-gateway` | Planned |
| `003-integration.md` | 3 — Integration | `phase-3-integration` | Planned |
| `004-dependencies.md` | 4 — The dependency pins | `phase-4-dependencies` | Planned |
| `005-release.md` | 5 — Verification and release | `phase-5-release` | Planned |

## What every deliverable specification cites

| It decides | From |
| --- | --- |
| What the step delivers and how it is checked | [requirements.md](../project/requirements.md), by requirement ID |
| Which weaknesses it adds, and their counterparts | the [service specification](../project/services/README.md), by scenario ID, and the [catalogue](../project/scenario-catalog.md) |
| How the pieces talk, where the data lives | [architecture/](../architecture/README.md), by section |
| The invariants no step may break | [AGENTS.md](../../AGENTS.md) and [security-model.md](../architecture/security-model.md#3-safety-rails) |

## Rules for this repository

- One deliverable, one specification, one branch, one pull request.
- Acceptance criteria are testable from their own text. Each names the behaviour, the boundary, the expected result and how it is verified.
- A specification may not add code that only matters for an application that stays up ([ADR-004](../architecture/decisions/ADR-004-ephemeral-stores.md)).
- A specification may not let a service call another service ([ADR-010](../architecture/decisions/ADR-010-services-never-call-each-other.md)).
- A sub-agent's specification limits its writes to its own service directory. Everything shared belongs to the lead agent.
- A weakness is not done until its exploit test, its counterpart tests, its Newman request, its documentation and its catalogue entry are in the same commit.
- Commands are written into documentation only after they have been run.
- When the `spec-builder` skill asks for a standards index under `.zazz/standards/`, this repository has none. The rules above and `AGENTS.md` stand in for it.
