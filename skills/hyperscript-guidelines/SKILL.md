---
name: hyperscript-guidelines
description: '_hyperscript (0.9.93) scripting guidelines for event handlers, element references, element and global state, async fetch, DOM manipulation, htmx integration, and debugging. Use when writing or reviewing inline _hyperscript behavior.'
metadata:
    aidd-category: general
---

# _hyperscript Guidelines

> **Version**: Target _hyperscript **0.9.93**.
> **CDN**: `<script src="https://cdn.jsdelivr.net/npm/hyperscript.org@0.9.93"></script>` (unpkg format `https://unpkg.com/hyperscript.org@0.9.93` also works)
> **npm**: `npm install hyperscript.org@0.9.93` (package name is `hyperscript.org`)
>
> _The `0.9.90` release added experimental reactivity, core templating, DOM morphing (`morph`), an
> experimental component framework, and new commands and expressions. It carries **breaking
> changes** to module structure and some syntax. Pin your version and test before upgrading from
> 0.9.14 to the 0.9.9x line. The patterns in this guide use the stable core syntax._

## Core Principles

1. Write readable, English-like syntax
2. Keep scripts close to the elements they affect
3. Use event-driven patterns
4. Follow hypermedia-friendly scripting practices
5. Maintain proper scoping
6. Leverage built-in features over custom JavaScript

## Basic Structure

### Script Placement

```html
<!-- Inline script: Place the _ attribute directly on the element -->
<button _="on click add .active">Click Me</button>

<!-- External script: Use a script tag with type="text/hyperscript" -->
<script type="text/hyperscript">
	def myFunction()
	  log "Hello, world!"
	end
</script>
```

### Event Handlers

```html
<!-- Basic event handling: 'on event command' -->
<div _="on click log 'clicked'"></div>

<!-- Multiple events in one script block -->
<div
	_="
  on click log 'clicked'
  on mouseover add .hover
  on mouseout remove .hover
"></div>

<!-- Event with modifiers: 'on event modifier(s) command' -->
<form _="on submit prevent default then send"></form>
```

## Best Practices

### 1. Element References

```html
<!-- 'me': Refers to the element the script is on -->
<button _="on click put 'Clicked!' into me"></button>

<!-- 'it' / implicit target: Refers to the result of the previous command or the event target -->
<!-- In 'on event...' blocks, 'it' often refers to the event object -->
<div _="on click log it"></div>

<!-- 'you' / specific targets: Used in 'tell selector' commands -->
<div _="on click tell <p/> in me add .highlight to you"></div>

<!-- Selectors: Use CSS selectors (e.g., '#id', '.class', 'tag') -->
<button _="on click add .active to closest <div/>"></button>
```

### 2. State Management

```html
<!-- Element-scoped variables: Use a colon prefix (:variable) -->
<div
	_="
  init
    set :count to 0
  end

  on click
    increment :count
    put :count into me
  end
"></div>

<!-- Global variables: Use the 'global' keyword -->
<script type="text/hyperscript">
	init
	  set global appState to {count: 0, loading: false}
	end
</script>
```

### 3. Async Operations

```html
<!-- Basic async: Commands like 'fetch' are async by default. Subsequent commands wait for completion. -->
<div
	_="on click
  fetch /data
  put it into me -- 'it' contains the result of fetch
"></div>

<!-- With error handling: Use try/catch blocks -->
<div
	_="on click
  try
    fetch /data
      put it into me
    catch e
      put 'Error loading data: ' + e into me -- 'e' contains the error object
      log e
  end
"></div>
```

### 4. Content Manipulation

```html
<!-- Put: Set the content of an element -->
<div
	_="on click
  put 'New content' into me
  add .updated
"></div>

<!-- Set: Set attributes or properties -->
<input _="on click set my value to 'clicked'" />

<!-- Add/Remove/Toggle Classes -->
<div
	_="on click
  add .active
  wait 2s
  remove .active
  toggle .visible on #otherElement
"></div>
```

## Advanced Patterns

### 1. Event Communication

```html
<!-- Trigger: Dispatch a custom event from an element -->
<button _="on click trigger customEvent"></button>

<!-- Listen: Listen for custom events using 'on eventName from selector' -->
<div _="on customEvent from button log 'Event received'"></div>

<!-- Trigger with data: Pass a detail payload with the event -->
<button _="on click trigger customEvent with {detail: {data: 'value'}}"></button>

<!-- Accessing event data: Access detail properties via 'event.detail' or 'it.detail' -->
<div _="on customEvent from button log it.detail.data"></div>
```

### 2. Server-Sent Events

```html
<!-- eventsource: Connect to and handle messages from an SSE stream -->
<div
	_="
  eventsource ChatUpdates from http://server/updates
    on message as json
      -- 'it' contains the parsed JSON data from the message
      put 'Message: ' + it.message into #messages end
    on open
      log 'SSE connection opened'
    end
    on error
      log 'SSE error'
    end
  end
"></div>
```

### 3. Progressive Enhancement

```html
<!-- Write your standard HTML/hypermedia first, then add _ attributes for dynamic behavior -->
<a _="on click fetch /data then put it into #content then halt the event" href="/data">
	Load Data (Progressively Enhanced)
</a>
<!-- In this example, the link works without JS, but with JS/hyperscript,
     it fetches and swaps content without a full page navigation -->
```

## Debugging

### 1. Using Debug Commands

```html
<!-- log: Outputs values or elements to the browser console -->
<div _="on click log me"></div>
<div _="on click log :myVariable"></div>

<!-- breakpoint: Halts script execution for debugging in dev tools -->
<div
	_="on click
  log 'Before breakpoint'
  breakpoint
  log 'After breakpoint'
"></div>

<!-- beep!: Outputs a debugging message or value to the console (less common than log) -->
<div _="on click beep! 'Debug message'"></div>
<div _="on click beep! :myVariable"></div>
```

### 2. Browser Developer Tools

- Use the browser's "Console" tab to see output from `log` and `beep!`.
- Use the "Sources" tab when a `breakpoint` is hit to inspect variables and step through code.
- Inspect elements to verify `_` attribute content.
- Monitor the "Network" tab for `fetch` requests.

### 3. Error Handling

- Use `try/catch` blocks for handling expected errors during async operations or potentially failing commands.
- Uncaught errors in hyperscript will typically appear in the browser console, often with details about the line number in the `_` script.

## Performance Considerations

### 1. Event Delegation

```html
<!-- Delegate events efficiently to a parent container -->
<div
	_="on click from <button/> in me -- Listen for clicks *on buttons* within this div
  add .active to target -- 'target' is the specific button that was clicked
">
	<button>Button 1</button>
	<button>Button 2</button>
</div>
```

### 2. Resource Management

```html
<!-- init: Run script when the element is connected to the DOM -->
<div
	_="
  init
    -- Setup observers, intervals, etc.
    set :myInterval to setInterval(() => log 'tick', 1000)
  end

  on disconnect
    -- Clean up resources when the element is removed from the DOM
    clearInterval(:myInterval)
    log 'Interval cleared'
  end
"></div>
```

## Security Guidelines

1. **Validate User Input:** Always validate data received from user input (forms, URLs, etc.) on the **server-side**. hyperscript is a client-side scripting language; client-side validation alone is insufficient.
2. **Sanitize Data:** Before inserting user-provided data into the DOM using commands like `put`, ensure it is properly sanitized or escaped to prevent Cross-Site Scripting (XSS) vulnerabilities. This often involves calling a trusted JavaScript function (e.g., a function from a library) that performs the sanitization.

    ```html
    <!-- Call a JS function named sanitizeHTML to clean the input -->
    <div
    	_="on click
      set userInput to <input#userData/>.value
      set safeContent to call sanitizeHTML(userInput)
      put safeContent into me
    "></div>
    <script>
    	// Example placeholder for a real sanitization function
    	function sanitizeHTML(htmlString) {
    		// Use a library like DOMPurify for production
    		const div = document.createElement('div');
    		div.textContent = htmlString;
    		return div.innerHTML;
    	}
    </script>
    ```

3. **Avoid `eval` and Dynamic Code Execution:** Be cautious with commands or patterns that execute dynamic strings as code, especially if those strings include user input.
4. **Proper Event Handling:** Use hyperscript's `on event from selector` for event delegation to reduce the number of active listeners, which can be a minor security hardening step against certain DOM manipulation attacks, but primarily a performance one.
5. **Content Security Policy (CSP):** Follow CSP best practices. Because hyperscript scripts are often inline in `_` attributes, your CSP might need to allow `unsafe-inline` for script or use nonces/hashes for inline scripts. Using `<script type="text/hyperscript">` with hashes or external files is generally more CSP-friendly than extensive inline `_` attributes for complex logic.

## Style Guide

### 1. Formatting

```html
<!-- Single line for simple commands -->
<div _="on click add .active"></div>

<!-- Multiple lines with indentation for complex scripts -->
<div
	_="
  on click
    add .loading to me
    fetch /data from my @href
    put it into #content
    remove .loading from me
  end
"></div>
```

### 2. Naming Conventions

```html
<!-- Element-scoped variables: Use camelCase or snake_case after the colon -->
<div _="init set :myCounter to 0 end"></div>

<!-- Global variables: Use camelCase or snake_case after 'global' -->
<script type="text/hyperscript">
	init
	  set global appState to {}
	end
</script>
```

## Integration Patterns

### 1. With HTMX

```html
<!-- Listen to htmx lifecycle events from an element or the body -->
<div
	_="on htmx:afterRequest from me
        if event.detail.successful
          add .success to me
        else
          add .error to me
          put event.detail.xhr.responseText into #error-message
        end"
	hx-post="/data"></div>

<!-- Trigger htmx requests from hyperscript -->
<button _="on click trigger click on #htmx-target"></button>
```

### 2. With Web Components

```html
<!-- Interact with Web Components: Listen for custom events, call methods -->
<custom-element
	_="
  on custom-event from me
    log 'Custom event received'
    -- Assumes 'me' is the Web Component instance
    call me.aPublicMethod()
  end
"></custom-element>
```

## Testing

1. **Use Browser Developer Tools:** Essential for debugging (`log`, `breakpoint`), inspecting elements, and monitoring events and network requests.
2. **Monitor Event Flow:** Use the browser console or debugger to verify that events are firing as expected and that `on ...` blocks are being executed.
3. **Check Console for Errors:** Look for JavaScript errors originating from hyperscript execution.
4. **Test Edge Cases:** Verify behavior with unexpected input, network failures, or specific timing scenarios.
5. **Verify Event Handlers:** Manually or using browser automation tools, interact with the elements to ensure the hyperscript logic executes correctly for all defined event triggers.
6. **Use `htmx.logAll()` for HTMX Interaction:** If integrating with htmx, enable htmx's debug logging alongside hyperscript's `log` and `breakpoint` to see the interaction between the two libraries.

## Additional Common Patterns

```html
<!-- Toggle Pattern: A concise way to add/remove a class -->
<button _="on click toggle .active on me"></button>

<!-- Counter Pattern: Simple state management and update -->
<button
	_="
  init set :count to 0
  on click
    increment :count
    put :count into me.innerHTML
">
	0
</button>

<!-- Form Validation Pattern: Example of client-side validation -->
<form
	_="on submit
  -- Find any required inputs that are empty within this form
  if <input[required]/> in me where its value is empty
    -- Add an error class to the invalid input
    add .input-error to it
    -- Add a general error message to the form or a specific element
    put 'Please fill out all required fields.' into #form-error-message
    -- Stop the default submit action (which would send the form/htmx request)
    halt the event
  else
    -- Remove previous error indicators if any
    remove .input-error from <input[required]/> in me
    put '' into #form-error-message
    -- If halt wasn't called, the original submit event proceeds
  end
">
	<input name="field1" required type="text" />
	<input name="field2" required type="email" />
	<div id="form-error-message" style="color: red;"></div>
	<button type="submit">Submit</button>
</form>
```

## References

Official sources behind this guide:

- _hyperscript documentation: <https://hyperscript.org/docs/>
- _hyperscript changelog: <https://github.com/bigskysoftware/_hyperscript/blob/master/CHANGELOG.md>
- 0.9.90 release notes (reactivity, templating, morphing): <https://hyperscript.org/posts/2026-03-29-hyperscript-0.9.90-is-released/>
- `hyperscript.org` npm package: <https://www.npmjs.com/package/hyperscript.org>
- Related skill: `htmx-guidelines`
