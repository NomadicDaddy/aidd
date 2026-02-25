## TESTING REQUIREMENTS

**ALL testing must use appropriate tools for comprehensive verification.**

### CRITICAL: No Test Suites or Harnesses

**DO NOT install or create test suites, test harnesses, or testing frameworks.**

- **NO** unit test frameworks (Jest, Vitest, Mocha, etc.)
- **NO** testing libraries or utilities
- **NO** test runner setups
- **NO** fixture files or test data factories
- **NO** mock/stub frameworks

**THREE TESTING METHODS ALLOWED (in order of preference):**

1. **agent-browser CLI** (PREFERRED) — Shell-based headless browser automation using `agent-browser` commands. Works from any CLI with shell access. See CLI reference for usage.
2. **Direct browser control/automation** using your environment's native browser automation tool (see CLI reference for exact tool name and syntax)
3. **Puppeteer scripted testing** (when explicitly required)

**Always prefer agent-browser** unless it is unavailable or the project explicitly overrides this in `project.md`.

### Available Testing Tools

**agent-browser CLI** (PREFERRED) - AI-native headless browser automation

- Drive and verify the UI via shell commands (`agent-browser open`, `click`, `fill`, etc.)
- AI-optimized snapshots with element refs for deterministic interaction
- Capture screenshots for visual evidence (`agent-browser screenshot`)
- Detect console errors (`agent-browser errors`)
- Network route interception for edge case testing
- Session isolation (`--session`) for parallel test scenarios
- Persistent profiles (`--profile`) for authenticated state reuse
- **PRIMARY TOOL** for feature verification — available to ALL CLIs via shell

**Native browser automation tool** (FALLBACK) - Environment-specific UI verification

- Use only when agent-browser is unavailable
- Capabilities vary by CLI environment (see CLI reference)

**Shell execution tool** - Test runners and automation

- Run quality control commands
- Build and compile code
- Execute agent-browser commands

**File read tool** - Test analysis

- Analyze test results and logs
- Review test output files
- Verify test coverage reports

**File/content search tool** - Test discovery

- Find relevant test files
- Locate test documentation
- Search for test patterns

### Testing Philosophy

**Test like a human user with mouse and keyboard. Don't take shortcuts that bypass comprehensive UI testing.**

### DO: Comprehensive Testing

✅ **Test through the UI** using agent-browser (preferred) or native browser automation

- Navigate: `agent-browser open <url>` then use snapshot refs to click/navigate
- Enter data: `agent-browser fill @ref "value"` or `agent-browser type "text"`
- Interact: `agent-browser click @ref`, `agent-browser select @ref "option"`
- Scroll: `agent-browser scroll down 500` or `agent-browser scroll @ref`
- Verify state: `agent-browser snapshot -i -c` to inspect current page

✅ **Take screenshots** to verify visual appearance

- Capture key states: `agent-browser screenshot ./before.png`
- After actions: `agent-browser screenshot ./after.png`
- Verify layouts, styling, and responsive behavior
- Document visual bugs with screenshot evidence

✅ **Check for console errors** in browser

- Run `agent-browser errors` to retrieve JavaScript errors
- Run `agent-browser eval "document.querySelectorAll('.error').length"` for DOM checks
- Check for failed network requests
- Monitor performance warnings

✅ **Verify complete user workflows** end-to-end

- Test entire feature flows, not just individual actions
- Verify data persistence across page reloads (`agent-browser reload` then re-check)
- Check error handling and edge cases
- Confirm success and failure paths

### DON'T: Testing Shortcuts

❌ **Only test with curl commands**

- Backend testing alone is insufficient
- API tests don't verify UI integration
- Missing visual bugs and UX issues

❌ **Use shortcuts that bypass UI testing**

- Don't assume UI works if API works
- Don't skip browser verification
- Don't rely solely on unit tests

❌ **Skip visual verification**

- UI bugs often aren't caught by API tests
- CSS issues require visual inspection
- Layout problems need screenshot verification

❌ **Mark tests passing without thorough verification**

- Partial testing leads to broken features
- Incomplete verification misses edge cases
- Shortcuts create technical debt

### Quality Bar

**Zero tolerance for:**

- Console errors in browser
- Failed API requests (unless intentional/handled)
- Visual bugs (white-on-white, broken layouts, etc.)
- Broken workflows (incomplete user journeys)

**Required for all features:**

- End-to-end UI verification
- Edge case testing
- Error handling verification
- Visual appearance confirmation

### Testing Workflow (agent-browser)

**Standard testing sequence:**

1. **Launch browser** → `agent-browser open http://localhost:3000`
2. **Snapshot page** → `agent-browser snapshot -i -c` (interactive elements, compact)
3. **Navigate to feature** → Identify target ref from snapshot, `agent-browser click @ref`
4. **Execute feature workflow** → Use `fill`, `click`, `select`, `type` with refs
5. **Verify success** → `agent-browser snapshot -i -c` to check resulting state
6. **Check console** → `agent-browser errors` (must return empty for pass)
7. **Test edge cases** → Repeat with invalid inputs, boundary conditions
8. **Capture evidence** → `agent-browser screenshot ./evidence.png`

**Ref-based workflow pattern:**

```
snapshot → identify refs → act on refs → re-snapshot → verify → repeat
```

Refs (e.g., `@e1`, `@e2`) are deterministic element handles returned by `snapshot`.
They eliminate CSS selector fragility and are purpose-built for AI agent interaction.

### Example: Testing a Login Feature

**Comprehensive test (agent-browser):**

```bash
# 1. Open the app
agent-browser open http://localhost:3000

# 2. Get interactive elements
agent-browser snapshot -i -c
# Output includes: link "Login" [ref=e3], ...

# 3. Navigate to login
agent-browser click @e3

# 4. Snapshot the login form
agent-browser snapshot -i -c
# Output includes: textbox "Email" [ref=e5], textbox "Password" [ref=e6], button "Submit" [ref=e7]

# 5. Fill and submit
agent-browser fill @e5 "test@example.com"
agent-browser fill @e6 "correct-password"
agent-browser click @e7

# 6. Verify redirect to dashboard
agent-browser snapshot -i -c
# Confirm: dashboard content visible, user name in header

# 7. Check console errors
agent-browser errors
# Expect: empty (no errors)

# 8. Edge case: invalid password
agent-browser back
agent-browser fill @e5 "test@example.com"
agent-browser fill @e6 "wrong-password"
agent-browser click @e7
agent-browser snapshot -i -c
# Confirm: error message visible

# 9. Capture evidence
agent-browser screenshot ./login-success.png
agent-browser screenshot ./login-error.png
```

**Insufficient test:**

```
1. curl -X POST /api/login -d '{"email":"test@example.com","password":"correct-password"}'
2. Verify: 200 OK response
❌ Missing: UI verification, visual checks, console errors, edge cases
```

### When to Skip Browser Testing

**Only skip agent-browser / browser automation if:**

- Feature is pure backend (no UI component)
- UI verification is blocked by external dependency
- agent-browser is not installed and no native browser automation is available
- project.md explicitly overrides testing requirements

**In all other cases, browser verification is MANDATORY.**
