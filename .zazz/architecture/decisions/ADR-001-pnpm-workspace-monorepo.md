# ADR-001 — One repository, a pnpm workspace, one package per service

**Status:** Proposed in Phase 0, waiting for review
**Date:** 2026-11-26

## Context

The lab has four NestJS applications and code they share. Two needs pull against each other.

- A dependency scanner has to be able to say **which service** has a vulnerable package. Phase 9 pins a vulnerable version in one workspace and a patched one in another, and the scanner has to tell them apart.
- The four applications form one system. A change to the federated schema touches the gateway and a subgraph together, and the end-to-end tests need all four.

## Decision

One repository with a pnpm workspace. Each service is its own package under `apps/`, with its own `package.json`, `nest-cli.json`, `tsconfig.json`, tests and build. Shared code is a workspace package under `libs/`. A service depends on a library through its `package.json`, never through a path alias into another service.

## Options considered

| Option | Why not |
| --- | --- |
| The NestJS CLI's monorepo mode: one root `package.json`, one dependency tree, several projects in `nest-cli.json` | One dependency tree cannot attribute a finding to a service. The same library cannot be at two versions in two services. It defeats the reason for the split |
| Four repositories | A schema change is four pull requests in four repositories. Nothing can start the whole lab from one checkout. Reviewing one phase means reviewing across repositories |
| npm or yarn workspaces | Equivalent in shape. pnpm is chosen because [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs) uses it, so the two labs are installed and maintained the same way |

## Consequences

- The lockfile has one importer per workspace. A library at two versions is an ordinary state, not an override.
- A change to a shared library and to the services that use it is one commit.
- Scripts use workspace filters (`pnpm --filter`), and the root scripts orchestrate.
- Every workspace repeats a little configuration. A shared `tsconfig.base.json` keeps it in step.
