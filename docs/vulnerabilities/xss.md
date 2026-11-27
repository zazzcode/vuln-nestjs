# `XSS` — cross-site scripting

Two weaknesses of the old console in `accounts`: a served file and a rendered page. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## XSS-002 — the stored upload served inline as its stored type

### XSS-002 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/documents/file/:name/view` |
| Sink | The stored bytes served inline with the content type the record carries, in `apps/accounts/src/legacy/legacy-documents.controller.ts` |
| Flow | the FS-003 upload (`marker.html`, `text/html`) → served inline as `text/html` → the script runs on the service's origin in the administrator's browser |
| Counterparts | `apps/accounts/src/documents/documents.controller.ts` (`:id/view`: an attachment with `nosniff`; `:id/image`: images only) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-79, SAST |

### XSS-002 — student guide

Content type is the server's claim about bytes. When the claim is the uploader's own word and the bytes go inline, an upload becomes a page of the origin it was uploaded to.

### XSS-002 — exploit lab

```console
$ curl -s $RELAY/internal/documents/legacy -H "authorization: Bearer $ALICE" \
    -F 'file=@marker.html;type=text/html' > /dev/null
$ curl -s -i $RELAY/internal/documents/file/marker.html/view -H "authorization: Bearer $ALICE"
HTTP/1.1 200 OK
content-type: text/html

<script>window.__zazzles = "zazzles-lab-marker"</script>
```

Inline, `text/html`, and no `nosniff`, no attachment: a browser that follows the link runs the marker. The same document by id:

```console
$ curl -s -i $RELAY/internal/documents/<id>/view -H "authorization: Bearer $ALICE" | grep -i 'content-disposition\|x-content-type'
content-disposition: attachment
x-content-type-options: nosniff
$ curl -s -o /dev/null -w '%{http_code}\n' $RELAY/internal/documents/<id>/image -H "authorization: Bearer $ALICE"
415
```

### XSS-002 — vulnerable and protected

| | Why |
| --- | --- |
| `file/:name/view` (vulnerable) | The bytes go out inline, typed by the record the uploader wrote |
| `:id/view` (protected) | An attachment with `nosniff`: downloaded, not rendered |
| `:id/image` (protected) | Images only — an HTML document is a 415 |

### XSS-002 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `XSS-002`: the view route answers `text/html` inline with the marker; by id the same document is an attachment with `nosniff`, and the image route refuses it.

## XSS-004 — a stored display name rendered unescaped

### XSS-004 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/admin/users-html` |
| Sink | Stored display names concatenated into HTML unescaped, in `apps/accounts/src/legacy/admin-html.controller.ts` |
| Flow | a display name carrying `<script>` is stored (the raw-body profile route accepts it) → the console's page renders it as markup |
| Counterparts | `apps/accounts/src/admin/admin.controller.ts` (`GET /internal/admin/users`: JSON with `nosniff`; `GET /internal/admin/directory`: a fixed template, escaped, CSP) |
| Tests | `apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts` |
| Expected finding | Yes, CWE-79, SAST |

### XSS-004 — student guide

Stored XSS needs two things: a value that carries markup, and a page that renders it as markup. The old console's page built its rows by concatenation, so the value was the page.

### XSS-004 — exploit lab

```console
$ curl -s -X PATCH $RELAY/internal/profile -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"displayName":"Alice<script>window.__zazzles = \"zazzles-lab-marker\"</script>"}' > /dev/null
$ curl -s $RELAY/internal/admin/users-html -H "authorization: Bearer $ADMIN" | grep -o '<script>[^<]*</script>'
<script>window.__zazzles = "zazzles-lab-marker"</script>
```

The stored script, verbatim, inside the administrator's page. The same stored name through the counterparts:

```console
$ curl -s -i $RELAY/internal/admin/users -H "authorization: Bearer $ADMIN" | grep -i 'x-content-type-options\|content-type'
x-content-type-options: nosniff
content-type: application/json; charset=utf-8
$ curl -s $RELAY/internal/admin/directory -H "authorization: Bearer $ADMIN" | grep -o '&lt;script&gt;'
&lt;script&gt;
```

And the directory page's CSP allows nothing: `default-src 'none'; style-src 'none'; script-src 'none'`.

### XSS-004 — vulnerable and protected

| | Why |
| --- | --- |
| `users-html` (vulnerable) | Every stored value goes into the page as it is stored |
| `GET /internal/admin/users` (protected) | The names are data in JSON, and `nosniff` says the browser may not read the answer as a page |
| `GET /internal/admin/directory` (protected) | A fixed template escapes every value, and the page's CSP allows no script |

### XSS-004 — tests

`apps/accounts/test/scenarios/fs-xss-ssrf.int-spec.ts`, `XSS-004`: the stored script renders raw on the page; the JSON route carries it as data with `nosniff`; the directory escapes it and its CSP allows nothing (the lab reset restores the name afterwards).
