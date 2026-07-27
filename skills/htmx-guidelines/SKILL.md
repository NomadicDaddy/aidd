---
name: htmx-guidelines
description: 'htmx 4.0 development guidelines for attributes, explicit inheritance, triggers, targets, swap modes (incl. morph), hx-status error handling, forms, SSE/WebSocket streaming, extensions, security/CSP, response headers, and 2.x migration. Use when writing or reviewing hypermedia-driven UI built with htmx.'
metadata:
    aidd-category: general
---

# htmx Guidelines

> **Version Requirements**: htmx **4.0.0-beta6** or higher (the fetch()-based v4 line is the adopted
> target; the 2.x line is legacy/maintenance)
> **CDN (minified, default)**: `https://cdn.jsdelivr.net/npm/htmx.org@4.0.0-beta6`
> **CDN (unminified)**: `https://cdn.jsdelivr.net/npm/htmx.org@4.0.0-beta6/dist/htmx.js`
> **bun**: `bun add htmx.org@4.0.0-beta6`
>
> _Target htmx **4** and pin the **exact** version (no `^` ranges) — v4 is in beta and betas have
> renamed events between releases. Prefer vendoring the file (self-hosted) over CDN so CSP can stay
> `script-src 'self'` and upgrades are deliberate. For existing 2.x codebases, see
> [Migrating from htmx 2.x](#migrating-from-htmx-2x)._

## Core Principles

1. Keep markup minimal and semantic
2. Use built-in HTTP methods (GET, POST, PUT, PATCH, DELETE) appropriately
3. Prefer server-side state management over client-side state
4. Target specific elements for updates instead of full page refreshes
5. Follow progressive enhancement patterns
6. Implement proper security measures
7. Use HATEOAS and the hypermedia-driven application paradigm
8. Be explicit: put `hx-target`/`hx-swap` on the triggering element; opt into inheritance
   deliberately with `:inherited`

## What Changed in 4.0

| Area        | htmx 4 behavior                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Engine      | `fetch()` replaces `XMLHttpRequest`; responses can stream into the DOM as they arrive                  |
| Inheritance | **Explicit** — attributes only cascade when marked `:inherited` (2.x cascaded implicitly)              |
| Errors      | **All responses swap except 204/304** — 4xx/5xx bodies are rendered; control with `hx-status:XXX`      |
| Events      | Renamed to `htmx:phase:action` (`htmx:before:request`, `htmx:after:swap`, `htmx:response:error`, …)    |
| Timeout     | Default request timeout is 60 s (was none)                                                             |
| History     | No localStorage page cache — back/forward refetch by default (`hx-history-cache` ext restores caching) |
| Extensions  | Loaded by including their script file — the `hx-ext` attribute is gone                                 |
| Swaps       | New styles: `innerMorph`, `outerMorph`, `textContent`, `delete`; `<hx-partial>` for multi-target swaps |
| New attrs   | `hx-status:*`, `hx-config`, `hx-action`, `hx-method`, `hx-validate`, `hx-ignore`, `hx-optimistic`      |

## Structure & Attributes

### Basic Usage

- Place htmx attributes only on elements that need dynamic behavior
- Use semantic HTML elements
- Keep attribute values simple and clear

```html
<!-- Good -->
<button hx-post="/api/save" hx-target="#result">Save</button>

<!-- Avoid -->
<div hx-post="/api/save" hx-target="#result" role="button">Save</div>
```

### Common Attributes

1. Request Triggers

```html
<!-- Basic trigger -->
<div hx-get="/data" hx-trigger="click"></div>
<!-- Advanced trigger with modifiers -->
<div hx-get="/data" hx-trigger="keyup delay:500ms changed"></div>
<!-- Multiple triggers -->
<div hx-get="/data" hx-trigger="load, click"></div>
```

2. Target Selection

```html
<!-- Target specific element -->
<button hx-post="/update" hx-target="#result"></button>
<!-- Target relative elements -->
<button hx-post="/update" hx-target="next .item"></button>
<!-- Target parent elements -->
<button hx-post="/update" hx-target="closest div"></button>
```

### Attribute Inheritance (explicit in 4.0)

Attributes no longer cascade to descendants by default. Add `:inherited` on the parent to share a
value down the DOM tree, and `:append` on a child to extend an inherited value:

```html
<!-- Both buttons inherit the confirm prompt and target -->
<div hx-confirm:inherited="Are you sure?" hx-target:inherited="#results">
	<button hx-get="/search">Search</button>
	<button hx-get="/filter">Filter</button>
</div>

<!-- Append to an inherited value -->
<div hx-include:inherited="#global-fields">
	<form hx-include:inherited:append=".extra">...</form>
</div>
```

`hx-disinherit` / `hx-inherit` are gone — they are unnecessary under the explicit model. Prefer
repeating the attribute on each element over inheritance unless a subtree genuinely shares behavior.

## Common Patterns

### Forms

```html
<form hx-post="/submit" hx-swap="outerHTML">
	<!-- form fields -->
</form>
```

### Dynamic Loading

```html
<div hx-get="/data" hx-trigger="intersect">
	<!-- content loads when scrolled into view -->
</div>
```

### Real-time Updates

```html
<div hx-get="/status" hx-trigger="every 2s">
	<!-- polls every 2 seconds -->
</div>
```

## Best Practices

### 1. Swap Modes

```html
<!-- Replace entire element -->
<div hx-get="/content" hx-swap="outerHTML"></div>
<!-- Update inner content only -->
<div hx-get="/content" hx-swap="innerHTML"></div>
<!-- Morph in place: preserves focus, selection, and unchanged nodes -->
<div hx-get="/content" hx-swap="innerMorph"></div>
<!-- Update text content only -->
<div hx-get="/content" hx-swap="textContent"></div>
<!-- Append new content -->
<div hx-get="/content" hx-swap="beforeend"></div>
<!-- Remove the target -->
<button hx-delete="/item/1" hx-swap="delete" hx-target="closest li">Remove</button>
```

Prefer the morph swaps (`innerMorph`/`outerMorph`) for refreshed lists, tables, and anything
containing form inputs — they avoid clobbering focus and scroll position on periodic or
event-driven refreshes.

### 2. Error Handling

htmx 4 swaps **every** response except 204/304 — including 4xx/5xx. Design error responses as
renderable fragments (this makes server-side form validation trivial), and use `hx-status` for
per-code routing:

```html
<form
	hx-post="/submit"
	hx-status:422="target:#validation-errors"
	hx-status:5xx="none"
	hx-target="#result">
	<div id="validation-errors"></div>
	<input name="email" />
	<button type="submit">Submit</button>
</form>
```

- `hx-status:XXX` accepts exact codes (`404`) and wildcards (`50x`, `5xx`), matched by specificity
- `hx-status:...="none"` suppresses the swap for that code
- Global fallback for unstyled failures: listen for `htmx:response:error` (HTTP errors) and
  `htmx:error` (everything else) in one external script and show a generic notice
- To restore 2.x behavior globally (rarely wanted): `htmx.config.noSwap = [204, 304, '4xx', '5xx']`

### 3. Loading States

```html
<!-- Inline indicator -->
<button hx-get="/data">
	Load Data
	<span class="htmx-indicator">Loading...</span>
</button>

<!-- External indicator -->
<div hx-get="/data" hx-indicator="#spinner">Content</div>
<div class="htmx-indicator" id="spinner">Loading...</div>
```

_The `hx-browser-indicator` extension can show the browser tab spinner instead; the default
indicator CSS is injected via constructable stylesheets (see `htmx.config.includeIndicatorCSS`)._

### 4. Form Handling

```html
<!-- Basic form submission -->
<form hx-post="/submit" hx-swap="outerHTML">
	<input name="username" type="text" />
	<button type="submit">Submit</button>
</form>

<!-- htmx respects standard HTML validation attributes; hx-validate controls validation behavior -->
<form hx-post="/submit-validated">
	<input name="email" required type="email" />
	<button type="submit">Submit</button>
</form>
```

Server-side validation pattern: respond `422` with the re-rendered form fragment (fields, values,
and error messages) — because error responses swap by default, the corrected form appears with no
client-side code.

### 5. Multi-Element Updates

```html
<!-- Out-of-band swaps still work -->
<div id="toast" hx-swap-oob="true">Saved.</div>

<!-- Preferred in 4.0: explicit multi-target partials in one response -->
<hx-partial hx-target="#row-42">...updated row...</hx-partial>
<hx-partial hx-swap="beforeend" hx-target="#toasts">...toast...</hx-partial>
```

## Advanced Patterns

### 1. Streaming & Real-time Updates

htmx 4's fetch engine processes streamed responses as they arrive — long-running endpoints can
flush HTML progressively with no extra markup.

```html
<!-- Polling -->
<div hx-get="/status" hx-trigger="every 2s"></div>

<!-- Server-Sent Events (hx-sse extension; fetch-based, any HTTP method) -->
<div hx-sse:connect="/events"></div>
<!-- unnamed SSE messages swap into the connecting element automatically -->
<!-- named events retrigger other elements: -->
<div hx-get="/notifications/badge" hx-trigger="notification-created from:body"></div>

<!-- WebSocket (hx-ws extension) -->
<div hx-ws:connect="wss://example.com/chat">
	<div id="chat_room"></div>
</div>
```

SSE reconnect behavior is configurable:
`<meta name="htmx-config" content="sse.reconnectDelay:1s sse.reconnectMaxAttempts:5" />`

### 2. Progressive Enhancement

```html
<!-- Fallback for non-JS environments -->
<a href="/data" hx-get="/data" hx-push-url="true">Load Data</a>
```

## Security Considerations

1. Only call routes you control
2. Validate all user input server-side
3. Use appropriate CORS settings
4. Set proper security headers
5. Use CSRF protection where needed
6. Implement proper authentication

```html
<!-- Example with CSRF token -->
<form hx-post="/submit">
	<input name="csrf_token" type="hidden" value="${csrf_token}" />
	<!-- form fields -->
</form>
```

### CSP

- `hx-on*`, `hx-vals='js:...'`, `hx-confirm='js:...'`, and JS trigger filters evaluate JavaScript
  and require `unsafe-eval`. Under a strict CSP, **avoid them** — use external scripts with
  `addEventListener` (the 2.x `allowEval`/`allowScriptTags` config switches were removed).
- For strict deployments, the **`hx-csp` extension** provides nonce gating (`hx-nonce` on
  htmx-active elements, fail-closed), a Trusted Types policy, and `safeEval:true` (nonce-based
  script injection instead of `new Function()`), enabling
  `script-src 'self' 'nonce-...'` + `trusted-types htmx`.
- Allowlist registered extension names, not script filenames:
  `<meta name="htmx-config" content='extensions:"sse,preload"' />`. The corresponding bundled
  files are still named `hx-sse.min.js` and `hx-preload.min.js`.

## Performance Optimization

### 1. Request Management

```html
<!-- Debouncing/Throttling -->
<input hx-get="/search" hx-trigger="keyup delay:500ms changed" />

<!-- Request cancellation -->
<div hx-get="/data" hx-sync="closest form:abort"></div>

<!-- Per-element timeout override (default is 60s in 4.0) -->
<button hx-config="timeout:30000" hx-get="/slow">Run</button>
```

### 2. Content Loading

```html
<!-- Lazy loading -->
<div hx-get="/content" hx-trigger="intersect"></div>
<!-- Preloading (hx-preload extension) -->
<a href="/data" hx-preload="mouseover">Load Data</a>
```

Other performance extensions: `hx-ptag` (skip unchanged polls via `HX-PTag` header),
`hx-history-cache` (restore back/forward pages from sessionStorage — off by default in 4.0),
`hx-optimistic` (optimistic UI while a request is in flight).

## Extension Usage

> **htmx 4 note**: the `hx-ext` attribute is **gone**. Load an extension by including its script
> after htmx core — its attributes then activate wherever used. First-party extensions ship under
> `dist/ext/` in the `htmx.org` package (also on the CDN).

```html
<script src="/vendor/htmx.min.js"></script>
<script src="/vendor/hx-sse.min.js"></script>
```

First-party extensions: `hx-sse`, `hx-ws`, `hx-multipart` (networking); `hx-live`, `hx-optimistic`,
`hx-browser-indicator`, `hx-prompt` (UX); `hx-preload`, `hx-ptag`, `hx-history-cache`
(performance); `hx-head`, `hx-upsert`, `hx-targets`, `hx-download` (swaps); `htmx-2-compat`,
`hx-alpine-compat`, `hx-csp` (compatibility/security).

The registered allowlist names omit the filename prefix: `sse`, `ws`, `multipart`, `preload`,
`head-support`, and so on. Confirm the registered name in the extension's official reference
before adding it to `htmx.config.extensions`.

## Configuration

Global config via a `<meta>` tag in `<head>` — HCON (`key:value` pairs) or JSON:

```html
<meta content="defaultSwap:outerHTML transitions:true" name="htmx-config" />
<meta content='{"defaultSwap":"outerHTML","transitions":true}' name="htmx-config" />
```

Per-element overrides via `hx-config`: `<button hx-config='credentials:"include"' hx-get="/api">`.

Renamed since 2.x: `defaultSwapStyle`→`defaultSwap`, `globalViewTransitions`→`transitions`,
`historyEnabled`→`history`, `timeout`→`defaultTimeout`.

## Request & Response Headers

```plaintext
Request:  HX-Request, HX-Request-Type, HX-Current-URL, HX-Source, HX-Target, HX-Boosted,
          HX-History-Restore-Request
Response: HX-Trigger (fires after swap), HX-Location, HX-Redirect, HX-Refresh, HX-Retarget,
          HX-Reswap, HX-Reselect, HX-Push-Url, HX-Replace-Url
```

Use all relevant navigation headers when choosing a full page or fragment:

- Return a full document for ordinary requests, `HX-Request-Type: full`, and
  `HX-History-Restore-Request: true`.
- Return a fragment only for a genuine partial request.
- Mark the restorable region with `hx-history-elt` and vary cacheable responses on the headers
  that shape the response.
- Return a `2xx` fragment or htmx response headers after successful htmx mutations. Response
  headers are not processed on `3xx`; reserve `303` redirects for ordinary HTML form submissions.

## Migrating from htmx 2.x

Run the official checker first — it scans templates and JS for 2.x-isms (requires Python 3):

```bash
bunx htmx.org@4.0.0-beta6 upgrade-check -- ./path/to/project/root
```

| htmx 2.x                       | htmx 4                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| Implicit attribute inheritance | Add `:inherited` on the parent (or set per element)         |
| 4xx/5xx never swapped          | All but 204/304 swap; use `hx-status:XXX` / `noSwap` config |
| `hx-vars`                      | `hx-vals` with `js:` prefix                                 |
| `hx-params`                    | Filter in an `htmx:config:request` listener                 |
| `hx-disable`                   | `hx-ignore` (and old `hx-disabled-elt` is now `hx-disable`) |
| `hx-ext="..."`                 | Include the extension script; no attribute                  |
| `sse-connect` / `sse-swap`     | `hx-sse:connect`; unnamed messages swap automatically       |
| `hx-trigger="sse:event"`       | `hx-trigger="event from:body"`                              |
| `htmx:afterSwap` etc.          | `htmx:after:swap` etc. (`htmx:phase:action` naming)         |
| `revealed` trigger             | `intersect` trigger                                         |

The `htmx-2-compat` extension restores implicit inheritance, old event names, and 2.x error
handling for gradual migrations — use it as a bridge, not a destination.

## Debugging

1. Use browser developer tools
2. Monitor network requests
3. Log all htmx events: `<meta name="htmx-config" content="logAll:true" />` (or
   `htmx.config.logAll = true` in the console)
4. Implement proper error logging on the server

## Environmental Considerations

### Browser Compatibility

- htmx 4 requires `fetch()`, `ReadableStream`, and modern DOM APIs — evergreen browsers only; no IE
- Shadow DOM / Web Components supported

### PowerShell Integration

- When PowerShell parses JavaScript, avoid template literals (backtick-based strings). Use
  traditional string concatenation to prevent syntax errors.
- Shell environment rules (PowerShell 7+ / `pwsh` only) live in `powershell-guidelines`.

## Reference Documentation

ALWAYS refer to the stack reference documentation for your project and ensure your code is compliant and follows the best practices provided therein.

Some Pode/Podex applications may surface these documents via a `/devdocs` folder at runtime. When present, `/devdocs` contains rendered copies of the same guidance.

## Routing Structure

### web routes -> routes/web/[page].ps1

    GET /                       ->  `/routes/web/index.ps1`
    POST /                      ->  `/routes/web/index.ps1`
    GET /config                 ->  `/routes/web/config.ps1`

## References

Official sources behind this guide:

- htmx 4 documentation: <https://four.htmx.org/docs>
- htmx 4 reference (attributes, events, config): <https://four.htmx.org/reference>
- htmx 4 extensions: <https://four.htmx.org/extensions>
- htmx 2→4 migration: <https://four.htmx.org/docs#migration> · compat: <https://four.htmx.org/extensions/htmx-2-compat>
- htmx releases/changelog: <https://github.com/bigskysoftware/htmx/releases>
- `htmx.org` npm package: <https://www.npmjs.com/package/htmx.org>
- Related skills: `hyperscript-guidelines`, `mustache-guidelines`, `powershell-guidelines`
