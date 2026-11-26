# Project

What the lab is for and what will be built. These documents are for the people building and maintaining the lab. Readers who want to *use* the lab start at [`docs/`](../../docs/README.md).

| Document | Holds |
| --- | --- |
| [project.md](project.md) | Product orientation: purpose, users, capabilities, operating assumptions, boundaries, glossary |
| [project-plan.md](project-plan.md) | Objective, goals, success criteria, constraints, the build order, risks, open questions |
| [requirements.md](requirements.md) | Numbered functional and non-functional requirements, traced to steps |
| [scenario-catalog.md](scenario-catalog.md) | The index of every designed scenario: its ID, its service, its vulnerable operation, its OWASP categories |
| [services/](services/README.md) | One specification per service: its data, its API, every designed weakness with its protected counterparts, its API tests |
| [implementation-plan.md](implementation-plan.md) | The build order: the scaffolding, the services in parallel, integration, the dependency pins, release |
| [notes/](notes/README.md) | Dated working notes: decisions and their reasons, measurements, the state of the work |

## State

Updated 2026-11-26, after review by the Project Owner.

- **Step 0 (this change):** the plan, the architecture, a specification for each service with its designed vulnerabilities, and the documentation skeleton. No application code exists yet, so nothing in this repository can be run.
- **Next:** Step 1, the scaffolding, in a new session. Its order of work is in [implementation-plan.md](implementation-plan.md#2-step-1--scaffolding).
