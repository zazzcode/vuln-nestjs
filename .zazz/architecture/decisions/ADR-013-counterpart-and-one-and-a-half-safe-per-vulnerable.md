# ADR-013 — A protected counterpart for every vulnerable operation, and one and a half safe operations for every vulnerable one

**Status:** Decided by the Project Owner, in two steps: on 2026-11-26 to reduce the number of safe routes so the lab is finished sooner, and on 2026-11-27 to fix the ratio at 1.5 to 1. The rule that settles a disagreement between the two parts is the lead agent's, open to the owner's review in [pull request 2](https://github.com/zazzcode/vuln-nestjs/pull/2).
**Date:** 2026-11-27

## Context

ADR-008 set out to build the safe functional baseline first and the deliberate flaws as twin operations, keeping about two safe operations for every vulnerable one. The specifications were written to that ratio: 65 vulnerable operations and 121 safe operations across the lab.

With the services about to be built, the Project Owner asked for the lab to be finished sooner. On 2026-11-26 they offered to reduce the number of safe routes; on 2026-11-27 they set the new ratio at one and a half safe operations for every vulnerable one.

Among the safe operations are the protected counterparts: the operations that receive the same payload as a vulnerable one and stay inert. They are how a scanner's false positives are measured, one weakness at a time. The others are extra safe operations, and safe operations that a flow needs.

## Decision

1. **Every vulnerable operation keeps its protected counterpart**, as its specification names it, with its test. This is the fourth invariant and does not change.
2. **The lab keeps about one and a half safe operations for every vulnerable one.** Of the safe operations that are nobody's counterpart, the most needed are built first, until the service reaches that ratio.
3. **Where the two disagree, the counterpart is built and the ratio gives way.** A specification that names more protected counterparts than the ratio has room for has them all. The evidence for a scenario outranks the number.
4. **Each service specification records what it left out**, and the counts in the catalogue and the README are corrected once, when the services are integrated.

What the ratio comes to, from the specifications of 2026-11-26. "About": the nearest whole number, and never fewer than the counterparts:

| Service | Vulnerable operations | Safe operations specified | About, at 1.5 | To leave out |
| --- | --- | --- | --- | --- |
| `accounts` | 28 | 41 | 42 | none |
| `trading` | 20 | 38 | 30 | about 8 |
| `notifications` | 9 | 29 | 14 | about 15 |
| The gateway | 8 vulnerable endpoints, and one deployment-level setting that has a hardened value instead of a counterpart | 13 | 12 | none |
| The lab | 65 | 121 | 98 | about 23 |

## Options considered

| Option | Why not |
| --- | --- |
| Keep two to one, as ADR-008 set out | About 23 safe operations that no flow, test or scenario needs, built and tested for breadth of clean code rather than for any scenario's evidence. The Project Owner asked for the lab sooner |
| Build only the counterparts, with no ratio | Some flows need a safe operation that is no scenario's counterpart, and a lab of flaws alone gives a scanner little clean code to be measured against |
| Fewer vulnerable operations | Never considered. The flaws are the product |

## Consequences

- The lab will report about 98 safe operations instead of 121. The number is each service's to report.
- What a scanner evaluation loses is some of the clean code it is measured against, not any comparison of a flaw with its counterpart. `tests/expected-scanner-findings.json` has one row per vulnerable file and one per counterpart; it does not change in kind.
- ADR-008's ratio is replaced. Its other decisions stand: the baseline first, the flaws as twin operations, a test in both directions for each scenario.
- The fourth invariant in `AGENTS.md` says this, and the order of work inside a service in the implementation plan builds the counterparts first.

## Verified facts

The counts are from the specifications as they stood on 2026-11-26: `accounts` 33 scenarios on 28 vulnerable operations with 41 safe ones; `trading` 21 on 20 with 38; `notifications` 10 on 9 with 29; the gateway 13 on 8 vulnerable endpoints and one deployment-level setting, with 13 safe endpoints of its own.

Not counted when this was written: how many of each service's safe operations are a scenario's counterpart. The third rule covers the case where that number is above the ratio.
