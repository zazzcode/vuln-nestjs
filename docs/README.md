# Documentation

For everyone who uses the lab: what it is, how it is built, how to run it, and what each scenario is. The planning and working documents for people who *build* the lab are in [`.zazz/`](../.zazz/README.md).

**Status:** the scaffolding is built. The lab installs, starts, answers and stops, and every test command in [setup-and-testing.md](setup-and-testing.md) runs. The scenarios are being built on top of it. This index says what exists now and which step adds the rest.

## Reference documents

| Document | Holds | Status |
| --- | --- | --- |
| [architecture.md](architecture.md) | How the system is put together, and why. The lifecycle, the services, how they talk | Written |
| [vulnerabilities/index.md](vulnerabilities/index.md) | What a scenario is, the families, how each one is documented, how to score a scanner | Written as a design. Becomes the table of every scenario as the services are built |
| [vulnerabilities/dependencies.md](vulnerabilities/dependencies.md) | The vulnerable dependency pins and every advisory they carry, checked against the GitHub Advisory Database | Written as a plan |
| `vulnerabilities/<family>.md` | One module per family: the flaw explained, reproduction with curl, Postman and Burp, the protected counterparts, the tests | Added with each scenario, as the services are built |
| [setup-and-testing.md](setup-and-testing.md) | How to set up, test and exercise the lab: install, start, stop, every test command with what it proves, curl and Postman against each service, and why there are relays | Written for the scaffolding |
| `adding-scenarios.md` | Checklist for adding a scenario | The scaffolding |

## The lab in one paragraph

A deliberately vulnerable NestJS application, built as a fake cryptocurrency exchange: one gateway serving a federated GraphQL schema, and three backend services for accounts (MongoDB), trading (MySQL) and notifications (SQLite), all in memory. It is started, preloaded with fake data, exercised, and shut down. Services never call each other. Every weakness has a stable ID, an automated test proving it is exploitable, and a protected counterpart that handles the identical payload safely.

Start with the [README](../README.md) for the objective and the warning, then [architecture.md](architecture.md).
