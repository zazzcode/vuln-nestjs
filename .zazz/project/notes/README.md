# Project notes

Working notes for developing and maintaining this lab: where the work stands, why things are the way they are, and what a work session found. They are not documentation for readers of the lab. Anything a reader needs belongs in the [README](../../../README.md) or in [`docs/`](../../../docs/README.md), and a note links to it instead of repeating it.

## Rules

- A note is one Markdown file named `<UTC date-time>_<topic>.md`, for example `2026-11-26T15-38-03Z_project-state.md`. Its first line repeats the date-time with the local offset.
- A note is an entry, not a living page. When something it says no longer holds, write a new note and move the old one to *Superseded* below.
- A note says what the documentation does not: a decision and its reason, a measurement, the state of the work, a lesson.
- A scenario ID is unique across the whole repository. Count the IDs with a script whenever a specification changes.
- `.zazz/ephemeral/` is ignored by git. It holds run logs, handoffs and QA findings that stay on the machine.

Index updated: 2026-11-26T17:00:00Z.

## Current notes

Newest first.

| Written (UTC) | Note | What it holds |
| --- | --- | --- |
| 2026-11-26 17:00 | [Project state](2026-11-26T17-00-00Z_project-state.md) | What is built (nothing runnable), where the plan stands, what waits for the Project Owner, and what the scaffolding has to prove first |
| 2026-11-26 17:00 | [Design revision and the spike](2026-11-26T17-00-00Z_design-revision.md) | Why the design changed after review, the safe-to-vulnerable ratio, what the federation-on-Fastify spike ran and found, and what pnpm 12 and the Apollo gateway need |
| 2026-11-26 15:38 | [Stack findings](2026-11-26T15-38-03Z_stack-findings.md) | What was measured about NestJS 12, the GraphQL packages, the adapters and the stores. Its last section, *Not verified*, is superseded by the design revision note; the rest holds |

## Superseded

| Written (UTC) | Note | Superseded by |
| --- | --- | --- |
| 2026-11-26 15:38 | [Project state](2026-11-26T15-38-03Z_project-state.md) | [Project state of 17:00](2026-11-26T17-00-00Z_project-state.md): the design was reviewed and revised |
