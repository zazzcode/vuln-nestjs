# `.zazz` — planning and working documents

`.zazz/` is the docs root for everything about *building* this repository: what the lab is for, how it is architected, what will be delivered in which phase, and the specifications that implement each phase. It follows the [Zazz methodology](https://github.com/zazzcode/zazz-skills), adapted in two ways: the project orientation lives in a `project/` directory instead of a single `project.md`, and no standards library is vendored yet.

Documentation for people who *use* the lab (architecture overview, vulnerability write-ups, setup and testing) lives in [`docs/`](../docs/README.md). A file in `.zazz/` links to it instead of repeating it.

## Layout

| Directory | Holds | Start at |
| --- | --- | --- |
| `project/` | Product orientation, the project plan with its phases, requirements, the planned scenario catalogue, dated working notes | [project/README.md](project/README.md) |
| `architecture/` | System shape, service communication, data, API design, security model, test strategy, repository layout, decision records | [architecture/README.md](architecture/README.md) |
| `specifications/` | One deliverable specification per phase, written before the phase is implemented | [specifications/README.md](specifications/README.md) |
| `ephemeral/` | Scratch, run logs, handoffs. Ignored by Git. | — |

## Documentation model

- Durable documents are committed Markdown, reviewed through the same pull requests as code.
- One phase is one feature branch (`phase-<n>-<slug>`) and one pull request. An agent commits and pushes to the feature branch; merge happens only after human review. See [project/project-plan.md](project/project-plan.md#8-branch-and-pr-workflow).
- `.zazz/ephemeral/` is never committed.

## Reading order

1. [project/project.md](project/project.md) — what the lab is.
2. [project/project-plan.md](project/project-plan.md) — why it exists, what success is, and the phases.
3. [architecture/project.md](architecture/project.md) — the system shape the phases build.
4. [specifications/README.md](specifications/README.md) — which specification covers which phase.
