# Documentation

For everyone who uses the lab: what it is, how it is built, how to run it, and what each scenario is. The planning and working documents for people who *build* the lab are in [`.zazz/`](../.zazz/README.md).

**Status:** Phase 0. The lab is planned and not yet built, so there is nothing to install or run. This index says what exists now and what each later phase will add.

## Reference documents

| Document | Holds | Status |
| --- | --- | --- |
| [architecture.md](architecture.md) | How the system is put together, and why. The lifecycle, the services, how they talk | Written |
| [vulnerabilities/index.md](vulnerabilities/index.md) | What a scenario is, the families, how each one is documented, how to score a scanner | Written as a plan. Becomes the table of every scenario as they ship |
| [vulnerabilities/dependencies.md](vulnerabilities/dependencies.md) | The vulnerable dependency pins and every advisory they carry, checked against the GitHub Advisory Database | Written as a plan |
| `vulnerabilities/<family>.md` | One module per family: the flaw explained, reproduction with curl, Postman and Burp, the protected counterpart, the tests | Added from Phase 5, with each scenario |
| `setup-and-testing.md` | Install, start, stop, and every test command with what it proves | Phase 1 |
| `adding-scenarios.md` | Checklist for adding a scenario | Phase 5 |

## The lab in one paragraph

A deliberately vulnerable NestJS application, built as a fake cryptocurrency exchange: one gateway serving a federated GraphQL schema, and three backend services for accounts (MongoDB), trading (MySQL) and notifications (SQLite), all in memory. It is started, preloaded with fake data, exercised, and shut down. Every weakness has a stable ID, an automated test proving it is exploitable, and — where meaningful — a protected counterpart that handles the identical payload safely.

Start with the [README](../README.md) for the objective and the warning, then [architecture.md](architecture.md).
