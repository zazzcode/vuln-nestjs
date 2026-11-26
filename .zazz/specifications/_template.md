<!--
  TEMPLATE — deliverable specification for one phase of this lab.
  Adapted from the Zazz methodology's regular specification template.

  Copy to .zazz/specifications/<nnn>-<slug>.md and replace every {{ placeholder }}.
  Delete every comment block, including this one. An unreplaced placeholder is worse
  than an omitted section: remove a section that does not apply.
-->

# {{ Phase N — title }} — Deliverable specification

**Branch:** `{{ phase-<n>-<slug> }}`
**Phase:** {{ N — phase name, as in the project plan }}
**Project Owner:** @zazzcode
**Deliverable Owner:** @zazzcode
**Review artifact:** {{ one PR for this specification | two PRs: {{ names }} }}
**Integration branch:** `main`
**Merge policy:** pull request review required. Agents commit and push to the feature branch only
**Drafted:** {{ YYYY-MM-DD }}
**Status:** {{ Draft | Approved | Implemented }}
**Execution record:** {{ `.zazz/ephemeral/<slug>-run-log.md` | N/A }}

---

## 0. Capability

{{ One paragraph: what this phase delivers, for whom, and what is true afterwards that is not true now. }}

## 1. Required reading for the implementor

Section-pinned. Not a license to load the whole repository.

- `{{ path }}` — {{ sections }}.
- `.zazz/project/requirements.md` — the requirements this phase delivers: {{ FR-x.y, NFR-n }}.
- `.zazz/project/scenario-catalog.md` — the scenarios this phase adds: {{ IDs, or "none" }}.
- `.zazz/architecture/{{ document }}.md` — {{ sections }}.
- `AGENTS.md` — the invariants.

## 2. Invariants

Restated here because a violation is a bad change however green the tests.

**INVARIANT 1 — The flaws are the product.** {{ Restate, or state that this phase adds none. }}

**INVARIANT 2 — Safety rails.** Loopback only, fake data, harmless markers, no real secrets, no telemetry.

**INVARIANT 3 — Sample-sized.** Nothing that only matters for an application that stays up.

**INVARIANT 4 — Ground truth is generated.** {{ Where a phase before Phase 5 says "not yet in place". }}

**INVARIANT 5 — {{ phase-specific }}.**

## 3. Scope

### Approved review shape

{{ One PR, or two. Why that unit is honest for review. }}

### In scope

| Path | New or modified | Reason |
| --- | --- | --- |
| `{{ path }}` | {{ New / Modified }} | {{ reason }} |

### Out of scope

- {{ item }}

## 4. Decisions

Each answers "why this over the obvious alternative?".

### D-1 — {{ title }}

**Decision.** {{ what }}

**Why.** {{ rationale, including the alternative that was rejected }}

## 5. Acceptance criteria

Testable from their own text: behaviour, boundary, expected result, verification.

| ID | Criterion | Verified by |
| --- | --- | --- |
| AC-1 | {{ When {{ caller }} sends {{ input }} to {{ operation }}, then {{ result }}. Not {{ other result }} }} | {{ test file or command }} |

## 6. Test strategy and evidence

| Layer | What it covers here | Evidence in the PR |
| --- | --- | --- |
| Unit | | |
| Integration | | |
| End to end | | |
| Newman | | |

For a scenario: the identical payload is sent to the twin and to the counterpart. The exploit assertion names what was gained. The counterpart assertion names why it was refused.

## 7. Implementation guidance

Ordered steps, with the riskiest one first.

1. {{ step }}

## 8. Agent implementation rules

- Commit and push to the feature branch only.
- Commands run from the repository root with pnpm: {{ `pnpm test`, `pnpm test:e2e`, … }}.
- Do not commit failing tests, half-applied refactors, or local evidence.
- Re-snapshot (`pnpm scenario:update`, `pnpm audit:update`) in the same commit as the change that justifies it.

## 9. Halt conditions

Stop and surface to the Project Owner before continuing if:

- {{ a decision record turns out to be wrong }}
- {{ a pinned version does not install or breaks a service }}
- {{ implementation needs to modify a path outside section 3 }}
- {{ a scenario cannot be made exploitable with a harmless marker }}

## 10. Signoff

- [ ] Every acceptance criterion is met and its evidence is in the pull request.
- [ ] `{{ the definition of done from the testing strategy }}` passes locally.
- [ ] Durable documents are updated: {{ which }}.
- [ ] The Project Owner has reviewed and approved.

## 11. Implementation and review change log

| Date | Change | Reason | Approved by |
| --- | --- | --- | --- |
| | | |
