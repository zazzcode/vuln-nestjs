# `SSRF` — server-side request forgery

One weakness of the old profile page's avatar import in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults). The in-lab target named here is the lab's own HTTP/1.1 health route — the gateway's — because the backend services speak HTTP/2 in cleartext, which an HTTP/1.1 client cannot fetch; the scenario's test observes the fetch with a stub the test itself starts on loopback, and proves the redirect-following with a 302 from that stub.

## SSRF-002 — the avatar URL is fetched wherever it points

### SSRF-002 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/profile/avatar` |
| Sink | `fetch(url)` with the default redirect following, in `apps/accounts/src/legacy/legacy-avatar.controller.ts` (`node-fetch` 2) |
| Flow | the caller's URL → the service fetches it → whatever the URL names on the machine's loopback is reached from inside |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`setAvatarUrl`: stores, fetches nothing), `apps/accounts/src/profile/profile.controller.ts` (`avatar/fetch`: an allowlisted origin, redirects refused) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-918, SAST |

### SSRF-002 — student guide

A URL the caller chooses is a request the service will make. Fetched with no allowlist, it reaches everything that listens on the machine — including services no client was ever meant to point at — and following redirects hands the destination to whoever answers first.

### SSRF-002 — exploit lab

```console
$ curl -s $RELAY/internal/profile/avatar -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"url":"http://127.0.0.1:4100/api/v1/health"}' | jq '{stored, status}'
{"stored": true, "status": 200}
```

The service fetched the lab's own health route because a caller said to (port 4100 here; the gateway's own address on the defaults). The test proves the same with a stub it starts on loopback — the stub records `/internal/health` as fetched — and proves the redirect: a 302 from the stub is followed to its target. The counterparts with the same URL:

```console
$ curl -s $RELAY/internal/profile/avatar/fetch -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"url":"http://127.0.0.1:4100/api/v1/health"}'
{"stored":false,"reason":"The avatar URL is not on the allowlist"}
```

And `setAvatarUrl` answers the stored URL and fetches nothing: the stub's count of hits does not move.

### SSRF-002 — vulnerable and protected

| | Why |
| --- | --- |
| `POST /internal/profile/avatar` (vulnerable) | The URL is fetched wherever it points, redirects followed |
| `setAvatarUrl` (protected) | The URL is stored as data; no request is made, so this URL is never fetched |
| `POST /internal/profile/avatar/fetch` (protected) | The origin allowlist is checked before any request, and a redirect is refused, not followed |

### SSRF-002 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `SSRF-002`: a loopback stub records the fetch and the followed redirect; `setAvatarUrl` and the allowlisted fetch leave the stub's count unchanged.
