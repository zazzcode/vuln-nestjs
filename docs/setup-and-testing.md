# How to set up, test and exercise the lab

**Status:** written for the scaffolding, on 2026-11-26. The scenarios are being built on top of it, and this page grows with them.

Every command on this page was run on macOS on arm64, with Node 24.21.0 and pnpm 12.23.0, and its output is as it came back. None was written before it was run. Where a command was run against the lab on other than its default ports, the page says so.

## 1. What you need

- Node 24.11 or later, and pnpm 12.23.0: the version `package.json` names under `packageManager`. Continuous integration installs that version with `pnpm/action-setup`.
- Nothing else is installed. The two in-memory database engines are downloaded the first time a service needs them, not at install: 722,567,409 bytes for MySQL 8.4.9 and 147,837,968 for MongoDB 8.2.6, as measured on an arm64 Mac. They are cached and reused.
- Access to the npm registry, for the install and for the audit.

The lab runs on `127.0.0.1` only, uses fake data, and stops without leaving anything behind. It holds no credential and sends no telemetry.

## 2. Install and build

```sh
pnpm install --frozen-lockfile
pnpm build
```

Both exit 0. The first installs exactly what the lockfile says and refuses if a manifest changed without it. The second builds every library and service into its `dist/`. `pnpm start` builds anything that is missing by itself.

Build before you lint, on a fresh checkout: a workspace's typecheck reads the built types of the libraries it uses. Continuous integration ran the two the other way round once, on 2026-11-26, and failed with `Cannot find module '@zazzles/exchange-config'` in two libraries.

## 3. Start, look, stop

```sh
pnpm start
```

The first start on a machine downloads the two database binaries before `accounts` can answer, which can take minutes. When the lab is up, the start command names its addresses:

```text
The lab is up, on loopback only. Stop it with Ctrl-C.
  GraphQL   POST http://127.0.0.1:3000/graphql
  Health    GET  http://127.0.0.1:3000/api/v1/health
  Reset     POST http://127.0.0.1:3000/api/v1/lab/reset
  Relay     accounts: HTTP/1.1 on http://127.0.0.1:3201, carried to the service over HTTP/2
  Relay     trading: HTTP/1.1 on http://127.0.0.1:3202, carried to the service over HTTP/2
```

| Address | Speaks | What it is |
| --- | --- | --- |
| `127.0.0.1:3000` | HTTP/1.1 | The gateway. `/graphql`, `GET /api/v1/health`, `POST /api/v1/lab/reset` |
| `127.0.0.1:3101` | HTTP/2, cleartext | `accounts` |
| `127.0.0.1:3102` | HTTP/2, cleartext | `trading` |
| `127.0.0.1:3103` | HTTP/1.1 | `notifications` |
| `127.0.0.1:3201` | HTTP/1.1 | The relay in front of `accounts` |
| `127.0.0.1:3202` | HTTP/1.1 | The relay in front of `trading` |

Each service answers `GET /internal/health` and `POST /internal/lab/reset` on its own address. The reset of a service answers only to the run's service token; the gateway's reset is open and resets every store.

Stop the lab with Ctrl-C. The start command exits with 0 when everything stopped as asked, and says which service had to be killed otherwise. Afterwards no database process and no temporary directory remain: the end-to-end suite proves it on every run.

The start command prints no secret of the run. Its end-to-end test reads everything it printed and fails on one.

## 4. Why there are relays

`accounts` and `trading` speak HTTP/2 in cleartext, by design. Cleartext HTTP/2 has no negotiation: a client has to start out speaking it. curl, Postman, Newman and Burp only speak HTTP/2 when TLS negotiates it, and the lab has no TLS, so none of them can reach those two services on their own addresses.

The start command opens one small relay in front of each (`scripts/relay.mjs`). A relay listens on `127.0.0.1`, speaks HTTP/1.1, carries each request to its service over HTTP/2, and streams the answer back. It decides nothing: the method, the path, the headers and the body are the caller's, and the status, the headers and the body are the service's. The service is asked for its own address, as the gateway asks it, so it cannot tell a request arrived through a relay. A relay opens before its service and closes before anything else stops.

You see the difference with two requests. The commands below were run against the lab on ports 4500 to 4512 (see [section 8](#8-moving-the-lab-to-other-ports)); on the default ports, read 3101 and 3201 where they say 4501 and 4511.

```sh
$ curl -sS --max-time 5 http://127.0.0.1:4501/internal/health
curl: (1) Received HTTP/0.9 when not allowed

$ curl -sS --max-time 5 -i http://127.0.0.1:4511/internal/health
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 82
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"ok","service":"accounts","store":{"engine":"mongodb","connected":true}}
```

The first went to the service over HTTP/1.1, which it does not speak. The second went through the relay and was answered. (The answers are as they came back, without the `date:` header.)

## 5. Exercise it by hand

All the commands in this section were run against the lab on ports 4500 to 4512. On the default ports: gateway 3000, `accounts` 3101, `trading` 3102, `notifications` 3103, the relays 3201 and 3202.

### Over HTTP/1.1: the gateway, notifications, and the relays

```sh
$ curl -sS --max-time 5 http://127.0.0.1:4500/api/v1/health
{"status":"ok","services":{"accounts":{"status":"ok","service":"accounts","store":{"engine":"mongodb","connected":true}},"trading":{"status":"ok","service":"trading","store":{"engine":"mysql","connected":true}},"notifications":{"status":"ok","service":"notifications","store":{"engine":"sqlite","connected":true}}}}

$ curl -sS --max-time 5 http://127.0.0.1:4503/internal/health
{"status":"ok","service":"notifications","store":{"engine":"sqlite","connected":true}}

$ curl -sS --max-time 5 -X POST http://127.0.0.1:4500/graphql -H 'content-type: application/json' -d '{"query":"{ announcements { id title } }"}'
{"data":{"announcements":[{"id":"1","title":"Welcome to VCX"}]}}

$ curl -sS --max-time 5 -X POST http://127.0.0.1:4500/graphql -H 'content-type: application/json' -d '{"query":"{ orders { id } }"}'
{"errors":[{"message":"Authentication required","path":["orders"],"extensions":{"code":"UNAUTHENTICATED","stacktrace":["…"]}}]}

$ curl -sS --max-time 5 -X POST http://127.0.0.1:4500/api/v1/lab/reset
{"accounts":"ok","trading":"ok","notifications":"ok"}
```

A GraphQL request is a `POST` with a JSON body of `query` and, when there is one, `variables`. The announcements are public. The orders need a caller: asked for without one, the service that owns them refuses with `UNAUTHENTICATED`.

The same request, sent to `trading` on its own address through its relay, is refused in the same way, by the service itself:

```sh
$ curl -sS --max-time 5 -X POST http://127.0.0.1:4512/graphql -H 'content-type: application/json' -d '{"query":"{ orders { id } }"}'
{"errors":[{"message":"Authentication required","locations":[{"line":1,"column":3}],"path":["orders"],"extensions":{"code":"UNAUTHENTICATED","stacktrace":["…"]}}]}

$ curl -sS --max-time 5 -i -X POST http://127.0.0.1:4511/internal/lab/reset
HTTP/1.1 401 Unauthorized

{"message":"A valid service token is required","error":"Unauthorized","statusCode":401}
```

Two things in those answers are on purpose, and are not accidents to report:

- **The errors carry a stack trace**, with the paths of this repository. The gateway's design keeps this on as scenario GQL-004.
- **A service's reset is refused without the run's service token.** The start command does not print that token. By hand, reset through the gateway, which is open and resets every store.

**A caller's token.** Operations that need a caller take a session token in `Authorization: Bearer`. Nothing mints one by hand yet: the sign-in operation arrives with the accounts scenarios. Until then, `pnpm test:api` is how the requests that need a caller are exercised. It makes three tokens for one run, in memory, and writes none of them.

### Over HTTP/2, straight to a service

curl speaks cleartext HTTP/2 when told to:

```sh
$ curl -sS --max-time 5 --http2-prior-knowledge -i http://127.0.0.1:4501/internal/health
HTTP/2 200
content-type: application/json; charset=utf-8
content-length: 82

{"status":"ok","service":"accounts","store":{"engine":"mongodb","connected":true}}
```

### From Postman

Import `postman/local.postman_environment.json` and the four collections under `postman/`, one per microservice. The environment gives the addresses, with `accountsUrl` and `tradingUrl` already pointing at the relays. Its four token variables are empty: fill them with a session token of your own once there is a sign-in, or leave the requests that need a caller to `pnpm test:api`.

This was not done in the Postman application here. The files are in Collection format v2.1, the format Postman imports, and `pnpm test:api` has Newman read the same files.

### Under Newman

```sh
pnpm test:api
```

starts the lab, runs every collection under Newman with the addresses and the tokens of that run, and stops the lab. See [section 6](#6-run-the-tests).

To see why the collections call `accounts` and `trading` through the relays, send Newman a request of its own straight at an HTTP/2 listener. A collection of one request, `GET http://127.0.0.1:4501/internal/health`, run with `pnpm exec newman run <file> --reporters cli`:

```text
→ accounts health
  GET http://127.0.0.1:4501/internal/health [errored]
     Parse Error: Expected HTTP/, RTSP/ or ICE/
```

Newman exits 1. The same request to the relay, `http://127.0.0.1:4511/internal/health`, with a test that asks for 200:

```text
→ accounts health, through the relay
  GET http://127.0.0.1:4511/internal/health [200 OK, 252B, 10ms]
  ✓  answers 200
```

### With other tools

The relays are there so that a tool does not need HTTP/2. **Of the tools below, only curl was run here.** Each row says where its statement comes from, so that it can be checked.

| Tool | Cleartext HTTP/2 to `accounts` and `trading` | With the relay | Where the statement comes from |
| --- | --- | --- | --- |
| curl | Yes, with `--http2-prior-knowledge` | Works | Run here; above |
| Insomnia | Yes. One setting for the whole application: Preferences, "Preferred HTTP version", "HTTP/2 PriorKnowledge" | Not run | Its source, read on 2026-11-26: the setting offers no per-request choice, so a session speaks HTTP/2 to everything or to nothing. Its command-line runner was not examined |
| Pororoca | Not stated in the pages of its documentation that were read | Not run | Those pages, read the same day: it imports Postman v2.1 collections and environments, so these files import. Its automated tests run on .NET |
| Burp | No | Not run | This lab's own decision record, ADR-003. Burp's documentation was not read here |
| HTTPie | Not stated in the pages of its documentation that were read | Not run | Not installed here. It is a command-line caller, with no assertions of its own |

## 6. Run the tests

All from the root of the repository. The counts are as at 2026-11-26, with the scaffolding alone; the scenarios add their own.

| Command | What it proves | Exit |
| --- | --- | --- |
| `pnpm lint` | oxlint with type awareness, then every workspace's typecheck. Zero warnings is the baseline. After a build, on a fresh checkout | 0 |
| `pnpm format:check` | Prettier over everything | 0 |
| `pnpm test` | Unit tests beside the code: every workspace, then the root's own. 170 at the time of writing | 0 |
| `pnpm test:int` | Each service's integration tests, one service at a time: the service starts alone, with its own store, and answers. Starts a database engine. 32 | 0 |
| `pnpm test:e2e` | The whole lab as four processes, started by the code `pnpm start` runs. 21 | 0 |
| `pnpm test:api` | The four Postman collections under Newman, against that lab: 19 requests, each with its assertions. One lab for the run | 0 |
| `pnpm scenario:check` | The committed scenario ground truth matches the catalogue | 0 |
| `pnpm audit:check` | The production audit matches the committed snapshot | 0 |

`pnpm test:e2e` and `pnpm test:api` use the lab's default ports, so two of them cannot run at once on one machine. [Section 8](#8-moving-the-lab-to-other-ports) says how to move one.

### What the end-to-end suite proves beyond the requests

After every lab it starts, the suite fails unless all of this holds:

- no database process and no temporary directory that the run created remained, and no service had to be killed;
- every relay is closed: nothing listens where it was;
- no service's process connected to, or resolved a name at, anything but this machine. Each service reports its outgoing connections when it stops, and the suite reads the reports;
- every listener answers on `127.0.0.1` and nowhere else: not on the IPv6 loopback address, not on an address of the network;
- each listener speaks exactly one protocol. `accounts` and `trading` answer HTTP/2 and nothing else; the gateway, `notifications` and the relays answer HTTP/1.1 and nothing else;
- the start command, run as a person runs it and interrupted, exits 0 and leaves nothing behind. Also when it is interrupted while still coming up.

## 7. The ground truth

Two checks keep the answer key honest. Neither is hand-edited; each is rewritten by its own command.

| Command | What it does |
| --- | --- |
| `pnpm scenario:check` | Reads `catalog/catalog.json` against `catalog/catalog.schema.json`, checks the catalogue is right (an identifier nobody designed, a weakness without a protected counterpart, a file that does not exist), and compares the two snapshots: the hash of every registered file, and what a scanner must report per file |
| `pnpm scenario:update` | Rewrites both snapshots. Refuses to when the catalogue is not right |
| `pnpm audit:check` | Runs `pnpm audit --prod --json`, puts it in one fixed order, and compares it with `tests/expected-audit.json`. Any difference fails it, and it says what differs |
| `pnpm audit:update` | Rewrites the snapshot. An advisory may leave it only by name: `pnpm audit:update --retire <id>` |
| `pnpm audit:lab` | The raw production audit. It exits 0 while the lab has no dependency pin; a nonzero exit afterwards is the lab working |

```sh
$ pnpm scenario:check
PASS: The catalogue is sound; 0 of 85 designed scenarios are registered; 0 registered files match tests/expected-hashes.json; tests/expected-scanner-findings.json matches the catalogue (0 rows).

$ pnpm audit:lab
No known vulnerabilities found
```

The baseline is to audit clean, so that every advisory from here on is one the lab designed. Five were reported by the registry in packages no workspace asks for; `pnpm-workspace.yaml` says, above its overrides, which those were and what each override crosses.

## 8. Moving the lab to other ports

Six variables move the lab, each with its default:

| Variable | Default | Moves |
| --- | --- | --- |
| `GATEWAY_PORT` | 3000 | The gateway |
| `ACCOUNTS_PORT` | 3101 | `accounts` |
| `TRADING_PORT` | 3102 | `trading` |
| `NOTIFICATIONS_PORT` | 3103 | `notifications` |
| `ACCOUNTS_RELAY_PORT` | 3201 | The relay in front of `accounts` |
| `TRADING_RELAY_PORT` | 3202 | The relay in front of `trading` |

The gateway finds the services through the same variables, so nothing else changes. Run, and working:

```sh
GATEWAY_PORT=4100 ACCOUNTS_PORT=4101 TRADING_PORT=4102 NOTIFICATIONS_PORT=4103 ACCOUNTS_RELAY_PORT=4111 TRADING_RELAY_PORT=4112 pnpm start
GATEWAY_PORT=4100 ACCOUNTS_PORT=4101 TRADING_PORT=4102 NOTIFICATIONS_PORT=4103 ACCOUNTS_RELAY_PORT=4111 TRADING_RELAY_PORT=4112 pnpm test:api
```

The start command then names `http://127.0.0.1:4100`, `http://127.0.0.1:4111` and `http://127.0.0.1:4112`, and the lab leaves every default port alone.

## 9. If something goes wrong

| What you see | Why | What to do |
| --- | --- | --- |
| `curl: (1) Received HTTP/0.9 when not allowed` | HTTP/1.1 was sent to a listener that speaks HTTP/2 | Use the relay's address, or `--http2-prior-knowledge` |
| Newman: `Parse Error: Expected HTTP/, RTSP/ or ICE/` | The same | The same |
| `The relay to accounts could not listen on 127.0.0.1:3201` | Something else listens there | [Move the lab](#8-moving-the-lab-to-other-ports) |
| Another lab, or a test that starts one, is already using these ports | The lab takes all of its ports | Stop the other one, or [move this one](#8-moving-the-lab-to-other-ports) |
| `The lab did not stop cleanly: <service> had to be killed` | A service did not stop within ten seconds of the interrupt | The start command stops what the service left behind and says so; open an issue with what it printed |
| After Ctrl-C, `pnpm start` ended by the interrupt (`SIGINT`), not with exit code 0 | On the Linux runner of GitHub Actions, with pnpm's own binary, `pnpm` ends by the interrupt itself while the launcher is still stopping the lab. The lab stopped cleanly. On macOS the command exits 0 | Nothing to do. To be sure: `pgrep -lx mongod` and `pgrep -lx mysqld` print nothing |
| `pnpm audit:check` fails with `The audit differs` | A dependency changed, or the registry published an advisory | Read what it says differs, review, then `pnpm audit:update` |
| `pnpm scenario:check` fails | A registered file changed, or the catalogue is not right | Review, then `pnpm scenario:update` |
