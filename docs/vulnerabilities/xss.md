# `XSS` — stored markup served as the page

**Family:** `XSS` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A03

An announcement's body is text a caller chose, and one of the three ways of
reading an announcement writes it into an HTML page as it was stored. The
other two do not: one answers JSON with `nosniff`, the other renders a fixed
template with the body escaped behind a content security policy.

| ID | The operation | The sink | CWE |
| --- | --- | --- | --- |
| XSS-001 | `GET /internal/announcements/:id/html` | `<%- body %>` in `views/announcement-html.ejs`, served as `text/html` | CWE-79 |

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
