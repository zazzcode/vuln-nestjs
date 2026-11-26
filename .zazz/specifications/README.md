# Specifications

One deliverable specification per phase. A specification is the contract for one bounded piece of work: it is written before the phase is implemented, approved before implementation starts, and kept current while it is implemented.

## Workflow

1. **Branch.** `git checkout -b phase-<n>-<slug>` from `main`.
2. **Draft.** Copy [`_template.md`](_template.md) to `<nnn>-<slug>.md` in this directory and fill it in. Commit it as the first commit on the branch and open the pull request as a draft.
3. **Greenlight.** The Project Owner approves the specification in the pull request, or asks for changes. No implementation starts before that.
4. **Implementation.** Work on the same branch. When implementation changes the contract, update the affected section in place and add an entry to the change log at the end of the specification.
5. **Review.** When the definition of done is met and the evidence is in the pull request, mark it ready. The Project Owner reviews and merges.
6. **Durable documents.** The same pull request updates the [project plan](../project/project-plan.md), the [architecture](../architecture/README.md), the [scenario catalogue](../project/scenario-catalog.md) and [`docs/`](../../docs/README.md) for whatever the change made untrue.

Specifications are committed Markdown, reviewed with the same pull request as the code.

## Index

| Specification | Phase | Branch | Status |
| --- | --- | --- | --- |
| — the plan is this change | 0 — Plan, architecture and documentation skeleton | `phase-0-plan-and-architecture` | In review |
| `001-foundation.md` | 1 — Foundation: walking skeleton | `phase-1-foundation` | Not written. Next, after the plan is approved |
| `002-accounts-functional.md` | 2 — Accounts, functional | `phase-2-accounts-functional` | Planned |
| `003-trading-functional.md` | 3 — Trading, functional | `phase-3-trading-functional` | Planned |
| `004-notifications-functional.md` | 4 — Notifications, functional | `phase-4-notifications-functional` | Planned |
| `005-scenario-framework.md` | 5 — Scenario framework and pilot batch | `phase-5-scenario-framework` | Planned |
| `006-accounts-vulnerabilities.md` | 6 — Accounts vulnerability batch | `phase-6-accounts-vulnerabilities` | Planned |
| `007-trading-vulnerabilities.md` | 7 — Trading vulnerability batch | `phase-7-trading-vulnerabilities` | Planned |
| `008-notifications-gateway-vulnerabilities.md` | 8 — Notifications and gateway vulnerability batch | `phase-8-notifications-gateway-vulnerabilities` | Planned |
| `009-vulnerable-dependencies.md` | 9 — Vulnerable dependencies | `phase-9-vulnerable-dependencies` | Planned |
| `010-verification-release.md` | 10 — Verification and release | `phase-10-verification-release` | Planned |

The scope of each phase is in the [project plan](../project/project-plan.md#7-phases-and-deliverables). A specification that is written may split a phase into two pull requests; it then says so and names both.

## What every specification cites

| It decides | From |
| --- | --- |
| What the phase delivers and how it is checked | [requirements.md](../project/requirements.md), by requirement ID |
| Which weaknesses it adds, and their counterparts | [scenario-catalog.md](../project/scenario-catalog.md), by scenario ID |
| How the pieces talk, where the data lives, what the API looks like | [architecture/](../architecture/README.md), by section |
| The invariants no phase may break | [AGENTS.md](../../AGENTS.md) and [security-model.md](../architecture/security-model.md#3-safety-rails) |

## Rules

- One deliverable, one specification, one branch, one pull request.
- Acceptance criteria are testable from their own text. Each names the behaviour, the boundary, the expected result and how it is verified.
- A specification may not add code that only matters for an application that stays up ([ADR-004](../architecture/decisions/ADR-004-ephemeral-stores.md)).
- A specification may not reverse a decision record. If implementation shows a record is wrong, the record changes through review first.
- A scenario is not done until its exploit test, its counterpart assertion, its Newman request, its documentation and its catalogue entry are in the same commit.
- Commands are written into documentation only after they have been run.
