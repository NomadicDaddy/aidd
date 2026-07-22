---
name: htmx-guidelines
description: 'htmx (2.0.10+) development guidelines for attributes, triggers, targets, swap modes, forms, real-time updates, htmx-ext extension packages, security, and response headers. Use when writing or reviewing hypermedia-driven UI built with htmx.'
metadata:
    aidd-category: general
---

# htmx Guidelines

> **Version Requirements**: htmx 2.0.10 or higher (IE11 support removed in 2.0+)
> **CDN (recommended)**: `https://cdn.jsdelivr.net/npm/htmx.org@2.0.10/dist/htmx.min.js`
> **CDN (alternative)**: `https://unpkg.com/htmx.org@2.0.10/dist/htmx.min.js`
> **bun**: `bun install htmx.org@^2.0.10`
>
> _Target htmx **2.0.10**. The official docs recommend **jsDelivr** as the primary CDN; unpkg uses
> the same URL format. The 2.x line is feature-complete but actively maintained. Do not adopt the
> beta htmx 4.0 rewrite for production work._

## Core Principles

1. Keep markup minimal and semantic
2. Use built-in HTTP methods (GET, POST, PUT, DELETE) appropriately
3. Prefer server-side state management over client-side state
4. Target specific elements for updates instead of full page refreshes
5. Follow progressive enhancement patterns
6. Implement proper security measures
7. Use HATEOS and hypermedia-driven application paradigm

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

## Common Patterns

### Forms

```html
<form hx-post="/submit" hx-swap="outerHTML">
	<!-- form fields -->
</form>
```

### Dynamic Loading

```html
<div hx-get="/data" hx-trigger="revealed">
	<!-- content loads when visible -->
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
<!-- Update text content only (htmx 2.0+) -->
<div hx-get="/content" hx-swap="textContent"></div>
<!-- Append new content -->
<div hx-get="/content" hx-swap="beforeend"></div>
```

### 2. Error Handling

```html
<!-- Simple loading indicator + placeholder for error message -->
<div hx-indicator=".spinner" hx-post="/action">
	<span class="htmx-indicator">Loading...</span>
	<div id="error-message"></div>
</div>

<!-- Custom error handling via events -->
<div hx-on::error="handleError(event)" hx-post="/action"></div>
```

_Note: Error styling or displaying error messages based on response status is often achieved via CSS targeting elements, or by swapping in error content to a dedicated element (e.g., using `hx-target-4xx` from the `response-targets` extension)._

### 3. Loading States

```html
<!-- Simple loading indicator (htmx 2.0.7+ improved accessibility) -->
<button hx-get="/data">
	Load Data
	<span class="htmx-indicator" style="visibility:hidden">Loading...</span>
</button>

<!-- External indicator -->
<div hx-get="/data" hx-indicator="#spinner">Content</div>
<div class="htmx-indicator" id="spinner" style="visibility:hidden">Loading...</div>
```

_Note: In htmx 2.0.7+, indicators use `visibility:hidden` instead of `display:none` for better screen reader accessibility._

### 4. Form Handling

```html
<!-- Basic form submission -->
<form hx-post="/submit" hx-swap="outerHTML">
	<input name="username" type="text" />
	<button type="submit">Submit</button>
</form>

<!-- Htmx respects standard HTML validation attributes (e.g., `required`) -->
<form hx-post="/submit-validated">
	<input name="email" required type="email" />
	<button type="submit">Submit</button>
</form>

<!-- Enhanced form validation error reporting with reportValidity() (htmx 2.0.7+, enabled via config) -->
<meta content='{"reportValidityOfForms":true}' name="htmx-config" />
<form hx-post="/submit">
	<input name="email" required type="email" />
	<input minlength="8" name="password" required type="password" />
	<button type="submit">Submit</button>
</form>
```

_Note: Htmx prevents the request if standard HTML validation fails client-side. In htmx 2.0.7+, `reportValidity()` provides enhanced form validation error reporting when enabled via configuration._

## Advanced Patterns

### 1. Content Updates

```html
<!-- Update multiple elements -->
<div hx-get="/data" hx-target="#result1, #result2" hx-trigger="load"></div>
<!-- Conditional updates based on status code (requires the response-targets extension) -->
<div
	hx-ext="response-targets"
	hx-get="/data"
	hx-target-200="#success-message"
	hx-target-4xx="#error-message"
	hx-trigger="load"></div>
```

### 2. Real-time Updates

```html
<!-- Polling -->
<div hx-get="/status" hx-trigger="every 2s"></div>
<!-- WebSocket (htmx 2.x: requires the ws extension; hx-ws was removed in 2.0) -->
<div hx-ext="ws" ws-connect="wss:/chat">
	<div id="chat_room">
		<form ws-send>
			<input name="message" />
		</form>
	</div>
</div>
```

### 3. Progressive Enhancement

```html
<!-- Fallback for non-JS environments -->
<a href="/data" hx-get="/data" hx-push-url="true"> Load Data </a>
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

## Performance Optimization

### 1. Request Management

```html
<!-- Debouncing/Throttling -->
<input hx-get="/search" hx-trigger="keyup delay:500ms changed" />

<!-- Request cancellation -->
<div hx-get="/data" hx-sync="closest form:abort"></div>
```

### 2. Content Loading

```html
<!-- Lazy loading -->
<div hx-get="/content" hx-trigger="revealed"></div>
<!-- Preloading (requires the preload extension; the preload attribute defaults to mousedown) -->
<div hx-ext="preload">
	<a href="/data" preload>Load Data</a>
</div>
```

## Extension Usage

> **htmx 2.0+ Note**: Extensions were moved **out of the core repo** into a dedicated project ([github.com/bigskysoftware/htmx-extensions](https://github.com/bigskysoftware/htmx-extensions), docs at [extensions.htmx.org](https://extensions.htmx.org)) and are now **versioned and published individually** as `htmx-ext-*` npm packages. Examples include `htmx-ext-ws`, `htmx-ext-sse`, `htmx-ext-response-targets`, `htmx-ext-preload`, `htmx-ext-class-tools`, `htmx-ext-json-enc`, and `htmx-ext-head-support`. The legacy `/dist/ext/` files still ship on the CDN so old URLs keep working, but prefer the per-package install/URL going forward. The `hx-ext="..."` attribute usage below is unchanged.

```html
<!-- Loading extensions (attribute usage unchanged) -->
<body hx-ext="class-tools, json-enc">
	<!-- Extension-specific attributes (example for class-tools) -->
	<div classes="add foo, remove bar:2s">Content</div>
</body>

<!-- Shadow DOM support (htmx 2.0+) -->
<my-web-component>
	<template shadowrootmode="open">
		<button hx-get="/data" hx-target="#result">Load Data</button>
		<div id="result"></div>
	</template>
</my-web-component>
```

## Response Headers

Important response headers to consider:

```plaintext
HX-Trigger: eventName
HX-Redirect: /new/location
HX-Refresh: true
HX-Reswap: innerHTML
HX-Retarget: #new-target
HX-Push-Url: /new/url
```

## Debugging

1. Use browser developer tools
2. Monitor network requests
3. Check htmx events in console (use `htmx.logAll()`)
4. Utilize htmx debug mode
5. Implement proper error logging on the server

```html
<!-- Enable debug logging (place in <head>) -->
<meta content='{"debug":true}' name="htmx-config" />
```

## Environmental Considerations

### Browser Compatibility (htmx 2.0+)

- **IE Support Removed**: htmx 2.0+ no longer supports Internet Explorer
- **Modern Browsers**: Chrome 60+, Firefox 55+, Safari 12+, Edge 79+
- **Shadow DOM**: Full support for Web Components and Shadow DOM in 2.0+

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

- htmx documentation: <https://htmx.org/docs/>
- htmx changelog: <https://github.com/bigskysoftware/htmx/blob/master/CHANGELOG.md>
- htmx 2.0 release (extensions moved out; `hx-ws`/`hx-sse` removed): <https://htmx.org/posts/2024-06-17-htmx-2-0-0-is-released/>
- htmx extensions (separate `htmx-ext-*` packages): <https://extensions.htmx.org/> · <https://github.com/bigskysoftware/htmx-extensions>
- `htmx.org` npm package: <https://www.npmjs.com/package/htmx.org>
- Related skills: `hyperscript-guidelines`, `mustache-guidelines`, `powershell-guidelines`
