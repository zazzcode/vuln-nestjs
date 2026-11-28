# `XSS` — cross-site scripting

4 scenarios: `XSS-001` in `notifications`, `XSS-002` in `accounts`, `XSS-003` in `gateway`, `XSS-004` in `accounts`.

**In `accounts`.**

Two weaknesses of the old console in `accounts`: a served file and a rendered page. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

**In `notifications`.**

**Family:** `XSS` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A03

An announcement's body is text a caller chose, and one of the three ways of
reading an announcement writes it into an HTML page as it was stored. The
other two do not: one answers JSON with `nosniff`, the other renders a fixed
template with the body escaped behind a content security policy.

| ID | The operation | The sink | CWE |
| --- | --- | --- | --- |
| XSS-001 | `GET /internal/announcements/:id/html` | `<%- body %>` in `views/announcement-html.ejs`, served as `text/html` | CWE-79 |

**In `gateway`.**

The public status page greets the caller by the `name` it sent, written into
the HTML as it arrived, from a scope that sets no security headers. The
reproduction was run on 2026-11-27 against the gateway alone on
`127.0.0.1:4400`.

## XSS-001 — an announcement page that serves script

### XSS-001 — agent reference

- **Scenario:** XSS-001, script in an announcement page.
- **Source:** `apps/notifications/src/announcements/announcement-html.controller.ts`
- **Operation:** `GET /internal/announcements/:id/html` (gateway: `GET /api/v1/announcements/:id.html`), REST, public.
- **Sink:** `response.render('announcement-html', { body })`, whose template writes the body with `<%- %>` — unescaped — and no content security policy.
- **Flow:** `stored body → AnnouncementHtmlController.html → res.render → <%- body %> → text/html to any reader`.
- **Counterparts:** `apps/notifications/src/announcements/announcement-by-id.controller.ts` (JSON, `nosniff`), `apps/notifications/src/announcements/announcement-page.controller.ts` (escaped, with a policy).
- **Tests:** `apps/notifications/test/scenarios/xss.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report stored caller text written into an HTML response unescaped.

### XSS-001 — student guide

The line (`apps/notifications/src/announcements/announcement-html.controller.ts`):

```ts
response.render('announcement-html', {
  title: announcement.title,
  body: announcement.body, // XSS-001 / CWE-79: the stored body reaches the page unescaped, as text/html with no policy
});
```

with the template (`apps/notifications/views/announcement-html.ejs`) writing
`<%- body %>`: the unescaped interpolation. The page exists so a client can
show an announcement without building one — but whatever the body holds is
markup of the page now. An announcement whose body is
`<img src=x onerror="window.__zazzles='zazzles-lab-marker'">` is served so
that a browser runs the `onerror` the moment it renders: the script is
stored once and executed in every reader's page. There is no content
security policy to stop it, and `text/html` tells the browser to believe
every tag.

The author's belief: "the body is written by administrators, and it is only
a lab." Stored XSS does not care who stored it: the field is caller input
the moment any caller can reach a route that writes it, and the page is
public.

### XSS-001 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`. The
announcement was created by `broadcastAnnouncement` with the payload body;
its id is 2.

```console
$ curl -si http://127.0.0.1:3103/internal/announcements/2/html
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
…
    <p><img src=x onerror="window.__zazzles='zazzles-lab-marker'"></p>
```

`200`, `text/html`, no `Content-Security-Policy`, and the stored script is
the page's own markup: opened in a browser, `window.__zazzles` becomes
`'zazzles-lab-marker'`. In Postman: the request `XSS-001: an announcement
page that serves script`, which creates its own announcement and reads the
page. In Burp: broadcast the payload announcement, then send the GET from
Repeater and read the page.

### XSS-001 — vulnerable and protected

| | Operation | What it does with the same body |
| --- | --- | --- |
| Vulnerable | `GET …/:id/html` | Writes it into the page unescaped, as `text/html`, with no policy |
| Counterpart 1 | `GET …/:id` | Answers it as a JSON value with `x-content-type-options: nosniff`: no browser reads it as a page |
| Counterpart 2 | `GET …/:id/page` | Renders the fixed template with the body escaped — `<` becomes `&lt;` — behind a policy whose `script-src` is `'none'` |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
the body that executes as markup on the first is a JSON value on the second
and escaped text on the third, where the policy would refuse a script even
if one slipped through. The claim is not that the policy makes every page
safe; only that this stored script reaches no reader's DOM through them.

### XSS-001 — tests

`apps/notifications/test/scenarios/xss.int-spec.ts`, describe `XSS-001: an
announcement page that serves script`. One payload — an announcement whose
body is the `onerror` image — is stored once per test by
`broadcastAnnouncement`, then read through all three routes:

- **The exploit:** `200`, `text/html`, no `content-security-policy`, and
  the body of the page contains the stored script as markup.
- **Counterpart 1:** `application/json`, `x-content-type-options: nosniff`,
  and the payload is a value inside the JSON document.
- **Counterpart 2:** `text/html`, a policy containing `script-src 'none'`,
  and the page holds `&lt;img`, never `<img`.

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

## XSS-003 — the public status page greets the caller with their own markup

### XSS-003 — agent reference

- **Source:** `apps/gateway/src/public-api/public-status.controller.ts` — `${name}` written into the greeting of the HTML answer.
- **Operation:** `GET /api/v1/public/status?name=…`, REST, public.
- **Sink:** the `text/html` answer of the public scope, which carries no content security policy, no `nosniff`, no frame options.
- **Flow:** `?name=<img onerror> → the greeting line → the caller's markup is the page's markup`.
- **Counterparts:** `apps/gateway/src/status/status.controller.ts` — `GET /api/v1/status` (the same name escaped into a fixed template, a policy set by hand), `GET /api/v1/status.json` (the name as a JSON value, `nosniff`).
- **Documentation:** this module. **Tests:** `apps/gateway/test/scenarios/edge.int-spec.ts`.
- **Expected finding:** CWE-79 on the public status controller. A report on the two counterpart routes for this CWE is a false positive.

### XSS-003 — student guide

A greeting that answers the caller by name is one interpolation; when the
name is written into the page as it arrived, the page is whoever asks for it.
Here the whole answer is built with a template literal whose only variable
part is the caller's `name`, so a `name` of `<img src=x
onerror="window.__zazzles='zazzles-lab-marker'">` is served as the page's own
markup — and the page is served from the public scope, where the edge's
security headers are off: no content security policy would refuse the script
even if the browser believed the tag. Any browser that opens the link runs
the `onerror` the moment the page renders.

### XSS-003 — exploit lab

The `name` is the marker, URL-encoded by the caller's client as
`%3Cimg%20src%3Dx%20onerror%3D%22window.__zazzles%3D'zazzles-lab-marker'%22%3E`.

```console
$ curl -s -i "http://127.0.0.1:4400/api/v1/public/status?name=%3Cimg%20src%3Dx%20onerror%3D%22window.__zazzles%3D'zazzles-lab-marker'%22%3E"
HTTP/1.1 200 OK
Origin-Agent-Cluster: ?1
content-type: text/html; charset=utf-8
…
    <p>Hello, <img src=x onerror="window.__zazzles='zazzles-lab-marker'">.</p>
```

`200`, `text/html`, and the marker sits in the page unescaped with no policy
above it: opened in a browser, `window.__zazzles` becomes
`'zazzles-lab-marker'`. The same `name` through the counterparts:

```console
$ curl -s "http://127.0.0.1:4400/api/v1/status?name=%3Cimg%20src%3Dx%20onerror%3D%22window.__zazzles%3D'zazzles-lab-marker'%22%3E"
<!DOCTYPE html>
…
    <p>Hello, &lt;img src=x onerror=&quot;window.__zazzles=&#39;zazzles-lab-marker&#39;&quot;&gt;.</p>
…

$ curl -s -i "http://127.0.0.1:4400/api/v1/status.json?name=%3Cimg%20src%3Dx%20onerror%3D%22window.__zazzles%3D'zazzles-lab-marker'%22%3E"
HTTP/1.1 200 OK
…
X-Content-Type-Options: nosniff
…
content-type: application/json; charset=utf-8
…
{"status":"ok","service":"gateway","caller":"<img src=x onerror=\"window.__zazzles='zazzles-lab-marker'\">","backendServices":["accounts","trading","notifications"]}
```

In Postman: `GET {{gatewayUrl}}/api/v1/public/status?name=<the encoded
marker>` and read the raw `<img` in the body. In Burp: the same GET from
Repeater, or paste the decoded URL into a browser driven by the intercepting
proxy.

### XSS-003 — vulnerable and protected

| | What it does with the same `name` | Why that holds |
| --- | --- | --- |
| `public/status` (vulnerable) | Writes it into the greeting unescaped, as `text/html`, no policy | The template interpolates the caller's markup into the page |
| `status` (protected) | Escapes it — `<` becomes `&lt;`, quotes become entities — behind `content-security-policy: default-src 'self'` and `x-frame-options: DENY` | The name is data in a fixed template, and the policy would refuse a script even if one slipped through |
| `status.json` (protected) | Answers it as a JSON value with `nosniff` | JSON is not a document to run markup in, and `nosniff` keeps a browser from reading it as one |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the
`name` that is markup on the first route is escaped text on the second and a
JSON value on the third. The claim is not that escaping or `nosniff` makes
every page safe; only that this marker reaches no DOM through them.

### XSS-003 — tests

`apps/gateway/test/scenarios/edge.int-spec.ts`: one test sends the encoded
marker to the public page and asserts the answer is `text/html` carrying the
marker unescaped (`&lt;img` nowhere) — what was gained; two tests send the
same marker to the counterparts and assert the escape (`&lt;img src=x` and
`default-src 'self'`) and the JSON shape (`nosniff`, the marker a value) —
why each was refused.

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
