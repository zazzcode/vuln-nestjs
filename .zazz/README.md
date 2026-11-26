# `.zazz` — planning and working documents

`.zazz/` is the docs root for everything about *building* this repository: what the lab is for, how it is architected, what each service must do, and in which order it is built. It follows the [Zazz methodology](https://github.com/zazzcode/zazz-skills), adapted in three ways: the project orientation lives in a `project/` directory instead of a single `project.md`; each service has a specification of its own under `project/services/`; and no standards library is vendored.

Documentation for people who *use* the lab (architecture overview, vulnerability write-ups, setup and testing) lives in [`docs/`](../docs/README.md). A file in `.zazz/` links to it instead of repeating it.

## Layout

| Directory | Holds | Start at |
| --- | --- | --- |
| `project/` | Product orientation, the project plan, requirements, the build order, a specification per service, the scenario catalogue, dated working notes | [project/README.md](project/README.md) |
| `architecture/` | System shape, service communication, data, API design, security model, test strategy, repository layout, decision records | [architecture/README.md](architecture/README.md) |
| `specifications/` | One deliverable specification per step of the build | [specifications/README.md](specifications/README.md) |
| `ephemeral/` | Scratch, run logs, handoffs. Ignored by Git | — |

## Reading order

1. [project/project.md](project/project.md) — what the lab is.
2. [project/project-plan.md](project/project-plan.md) — why it exists, what success is, and what was decided.
3. [project/services/README.md](project/services/README.md) — the contract of each service, with every designed weakness and its protected counterparts.
4. [project/implementation-plan.md](project/implementation-plan.md) — the build order: the scaffolding, the services in parallel, integration, the dependency pins, release.
5. [architecture/project.md](architecture/project.md) — the system shape.
6. [specifications/README.md](specifications/README.md) — which deliverable specification covers which step.

## Documentation model

- Durable documents are committed Markdown, reviewed through the same pull requests as code.
- One deliverable is one feature branch (`phase-<n>-<slug>`) and one pull request. An agent commits and pushes to the feature branch; merge happens only after human review. See [project/project-plan.md](project/project-plan.md#8-branch-and-pr-workflow).
- A deliverable specification is written with the `spec-builder` skill, vendored in [`.agents/skills/`](../.agents/skills/README.md).
- `.zazz/ephemeral/` is never committed.
