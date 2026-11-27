# Agent skills

| Skill | Use it for |
| --- | --- |
| [`spec-builder/`](spec-builder/SKILL.md) | Writing a deliverable specification, with its templates for a regular branch and for a stacked lane |
| [`spec-driven/`](spec-driven/SKILL.md) | The lifecycle after a specification is approved: who coordinates, the run log, how a change to the contract is recorded, and what must hold before a person signs off |
| [`pr-builder/`](pr-builder/SKILL.md) | A draft pull request's title and body, from the changes and the evidence that they were verified |
| [`pr-review/`](pr-review/SKILL.md) | Reviewing a pull request along two axes: documented standards, and the specification it was built from |
| [`doc-check/`](doc-check/SKILL.md) | The repository's own checks on documentation, before it is committed |
| [`handoff/`](handoff/SKILL.md) | Writing a handoff document under `.zazz/ephemeral/` when work moves to another session or agent |

`spec-builder` and `handoff` came from [zazzcode/zazz-skills](https://github.com/zazzcode/zazz-skills), at commit `b97bfc7165f5d45e35bd93176f8df2299e58cd33` (2026-08-01). The other four came on 2026-11-27 from the authors' staging copy of the same skills, `stage/.agents/skills` in the `zazzles` repository, ahead of their publication in `zazz-skills`. MIT licensed; the license is in [LICENSE](LICENSE).

They are vendored unchanged, with one exception: `spec-driven` has a section its source does not have, "Checkpoints: committed work is not lost work", added here on 2026-11-27 at the Project Owner's request. Otherwise, a change to how a skill works belongs upstream first; a rule that applies only to this repository belongs in [AGENTS.md](../../AGENTS.md), which the skills read for the docs root and the operating model.
