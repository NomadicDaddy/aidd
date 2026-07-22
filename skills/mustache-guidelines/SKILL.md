---
name: mustache-guidelines
description: 'Mustache logic-less templating for server-rendered HTML fragments, including variables, escaping, sections, inverse sections, partials, and htmx integration. Use when writing or reviewing Mustache templates that render HTML for htmx swaps.'
metadata:
    aidd-category: general
---

# Mustache Guidelines

Mustache is a simple, logic-less templating system. It's ideal for rendering HTML fragments on the server to be consumed by htmx, promoting a clear separation between presentation (template) and logic (server code).

## Core Principles

1. **Logic-less:** Templates only display data, they do not contain complex logic (if/else, loops). All data preparation happens server-side.
2. **Data-driven:** Templates are rendered solely based on the data context provided to them.
3. **Server-side Rendering:** Mustache templates are processed on the server to produce HTML output.
4. **Partial HTML:** For htmx, render just the HTML fragment needed for the swap, not a full HTML document (`<html>`, `<head>`, `<body>`).
5. **Separation of Concerns:** Template handles _how_ data looks, server handles _what_ data is available and _what_ actions to perform.

## Structure & Tags

Mustache uses tags enclosed in double curly braces `{{ }}`.

### 1. Variables

Display the value of a key from the data context. By default, HTML is escaped.

```mustache
<p>Hello, {{name}}!</p>
```

_Data Context Example:_

```json
{ "name": "World" }
```

_Output:_

```html
<p>Hello, World!</p>
```

### 2. Unescaped Variables (Use with Caution!)

Display the raw value of a key. **HTML is NOT escaped.** This is a significant security risk if the data comes from user input.

```mustache
<p>Raw HTML: {{{html_content}}}</p>
<p>Alternate Unescaped: {{& another_html}}</p>
```

_Data Context Example:_

```json
{ "html_content": "<strong>bold text</strong>" }
```

_Output:_

```html
<p>Raw HTML: <strong>bold text</strong></p>
```

**Security Warning:** Only use `{{{ }}}` or `{{& }}` with data you absolutely trust not to contain malicious HTML/JavaScript.

### 3. Sections (Truthy Values)

Render the content within the section if the value of the key is truthy (non-false, non-null, non-empty list/string, non-zero).

```mustache
{{#isAuthenticated}}
  <button>Logout</button>
{{/isAuthenticated}}
```

_Data Context Example:_

```json
{ "isAuthenticated": true }
```

_Output:_

```html
<button>Logout</button>
```

### 4. Sections (Lists - Iteration)

Iterate over a list. The content within the section is rendered once for each item in the list. Inside the section, the data context is the current item.

```mustache
<ul>
  {{#items}}
    <li>{{name}} - {{price}}</li> {{! Reference properties of the current item; use a lone dot tag for lists of primitives }}
  {{/items}}
</ul>
```

_Data Context Example:_

```json
{
	"items": [
		{ "name": "Apple", "price": 1.0 },
		{ "name": "Banana", "price": 0.5 }
	]
}
```

_Output:_

```html
<ul>
	<li>Apple - 1.0</li>
	<li>Banana - 0.5</li>
</ul>
```

### 5. Inverse Sections (Falsy Values)

Render the content within the section if the value of the key is falsy (false, null, 0, "", empty list).

```mustache
{{^isLoggedIn}}
  <button>Login</button>
{{/isLoggedIn}}
```

_Data Context Example:_

```json
{ "isLoggedIn": false }
```

_Output:_

```html
<button>Login</button>
```

### 6. Partials

Include the content of another template file or named template. Partials inherit the current data context.

```mustache
<div>
  <h1>User Profile</h1>
  {{> user_details_partial}}
</div>
```

_(The server-side Mustache engine needs to know how to find `user_details_partial`)_

### 7. Comments

Comments are ignored during rendering.

```mustache
{{! This is a comment }}
<div>...</div>
```

## Integration with HTMX

The primary use case for Mustache with htmx is rendering the HTML response on the server.

1. **HTMX Request:** Client-side htmx triggers a request (`hx-get`, `hx-post`, etc.).
2. **Server Receives Request:** Server-side application endpoint handles the request.
3. **Server Logic:** Server fetches necessary data from database, APIs, etc.
4. **Data Preparation:** Server structures the fetched data into a context (e.g., a map or dictionary) that matches the keys used in the Mustache template. All conditional logic, data formatting, etc., is done _here_.
5. **Template Selection:** Server selects the appropriate Mustache template file (often a partial template intended for an htmx swap).
6. **Rendering:** Server-side Mustache library is invoked, passing the template and the prepared data context. It produces an HTML string.
7. **HTTP Response:** Server sends an HTTP response with a `Content-Type` of `text/html` and the rendered HTML string in the body.
8. **HTMX Swap:** Client-side htmx receives the response and swaps the received HTML into the DOM according to the `hx-target` and `hx-swap` attributes on the triggering element.

## Best Practices (HTMX Specific)

- **Render Partial HTML:** Your server endpoint should return only the HTML needed for the target element, not full HTML documents.
- **Match Structure to Swap:** The root element(s) of your rendered HTML should align with what `hx-target` and `hx-swap` expect. If `hx-swap="outerHTML"` on `#my-div`, the response might be `<div id="my-div">...new content...</div>`. If `hx-swap="innerHTML"`, the response is just the `...new content...`.
- **Prepare ALL Data Server-Side:** Since Mustache is logic-less, ensure your server code performs all data transformations, filtering, sorting, and determines which sections should be shown/hidden before passing data to the template.
- **Use Partials for Reusability:** Break down complex UI into smaller, reusable Mustache partials.
- **Consistent Data Context:** Design your server endpoints to provide predictable data structures to your templates.

## Security Considerations

- **AVOID Unescaped HTML (`{{{ }}}`, `{{& }}`) with User Input:** This is the single biggest security risk. Always use the default `{{ }}` for any data that could potentially contain script tags or malicious HTML from users.
- **Server-Side Validation is Mandatory:** Client-side htmx actions or forms handled by htmx do not replace the need for robust server-side input validation.
- **Sanitize Input Server-Side:** If you absolutely _must_ include user-provided HTML (e.g., a rich text editor output), sanitize it rigorously server-side using a dedicated sanitization library _before_ passing it to the template context, even if you then use `{{{ }}}`.

## Performance Considerations

- **Server-Side Rendering Speed:** Mustache rendering itself is generally fast.
- **Network Latency:** The main performance factor is sending the HTML fragment over the network. Keep responses reasonably sized.
- **Server-Side Data Fetching:** Optimize database queries and API calls that populate the template data context.

## Debugging

- **Inspect Server Logs:** Check server-side logs for errors related to data preparation or the Mustache rendering process.
- **Log Data Context:** Temporarily log the data context object your server is passing to the Mustache template to ensure it contains the expected keys and values.
- **View Rendered HTML Server-Side:** If possible, inspect the raw HTML string produced by the server's rendering step before it's sent in the HTTP response.
- **Browser Developer Tools:** Use the "Network" tab to inspect the actual HTTP response from the server when an htmx request is made. Look at the "Preview" or "Response" tab to see the HTML fragment received. Check if the HTML structure is as expected for your `hx-target` and `hx-swap`.

## Example Flow

1. **Client HTML:**

    ```html
    <div id="user-profile">
    	<button hx-get="/get-profile/123" hx-swap="innerHTML" hx-target="#user-profile">
    		Load Profile
    	</button>
    </div>
    ```

2. **User Clicks Button:** HTMX sends GET request to `/get-profile/123`.
3. **Server Endpoint `/get-profile/123`:**
    - Receives request.
    - Fetches user data for ID 123 (e.g., `{ "name": "Alice", "email": "alice@example.com" }`).
    - Loads `profile_partial.mustache` template.
    - Renders template with user data.
4. **`profile_partial.mustache`:**

    ```mustache
    <h2>User Details</h2>
    <p>Name: {{name}}</p>
    <p>Email: {{email}}</p>
    {{! No <html>, <head>, <body> tags }}
    ```

5. **Server Response:** Sends `200 OK` with `Content-Type: text/html` and body:

    ```html
    <h2>User Details</h2>
    <p>Name: Alice</p>
    <p>Email: alice@example.com</p>
    ```

6. **Client HTMX:** Receives HTML, swaps it into `#user-profile` using `innerHTML`.
7. **Resulting Client HTML:**

    ```html
    <div id="user-profile">
    	<h2>User Details</h2>
    	<p>Name: Alice</p>
    	<p>Email: alice@example.com</p>
    </div>
    ```

## References

The Mustache specification is stable and language-agnostic; these are the authoritative sources:

- Mustache manual (tag syntax): <https://mustache.github.io/mustache.5.html>
- Mustache project home &amp; implementations: <https://mustache.github.io/>
- Mustache spec (conformance test suite): <https://github.com/mustache/spec>
- Related skill (consuming rendered fragments): `htmx-guidelines`
