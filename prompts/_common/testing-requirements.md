## TESTING REQUIREMENTS

**ALL testing must use appropriate tools for comprehensive verification.**

### Available Testing Tools

**browser_action** - UI verification and interaction

- Drive and verify the UI in a browser
- Simulate real user interactions (clicks, typing, scrolling)
- Capture screenshots for visual verification
- Check console logs for errors
- **PRIMARY TOOL** for feature verification

**execute_command** - Test runners and automation

- Run test suites (jest, pytest, etc.)
- Execute automation scripts
- Run quality control commands
- Build and compile code

**mcp_filesystem_read_text_file** - Test analysis

- Analyze test results and logs
- Review test output files
- Verify test coverage reports

**mcp_filesystem_search_files** - Test discovery

- Find relevant test files
- Locate test documentation
- Search for test patterns

### Testing Philosophy

**Test like a human user with mouse and keyboard. Don't take shortcuts that bypass comprehensive UI testing.**

### DO: Comprehensive Testing

✅ **Test through the UI** with clicks and keyboard input

- Navigate using browser_action.click
- Enter data using browser_action.type
- Scroll using browser*action.scroll*\*
- Verify visual appearance

✅ **Take screenshots** to verify visual appearance

- Capture key states (before, during, after actions)
- Document visual bugs
- Verify layouts and styling
- Confirm responsive behavior

✅ **Check for console errors** in browser

- Review browser console output
- Identify JavaScript errors
- Check for failed network requests
- Monitor performance warnings

✅ **Verify complete user workflows** end-to-end

- Test entire feature flows, not just individual actions
- Verify data persistence across page reloads
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

### Testing Workflow

**Standard testing sequence:**

1. **Launch browser** → `browser_action.launch` the frontend URL
2. **Navigate to feature** → Use clicks/typing to reach the feature area
3. **Execute feature workflow** → Complete the full user journey
4. **Verify success** → Check UI, data, and console
5. **Test edge cases** → Try invalid inputs, boundary conditions
6. **Capture evidence** → Take screenshots of key states
7. **Review console** → Check for any errors or warnings

### Example: Testing a Login Feature

**Comprehensive test:**

```
1. Launch http://localhost:3000
2. Click "Login" button
3. Type email: "test@example.com"
4. Type password: "correct-password"
5. Click "Submit"
6. Verify: Redirected to dashboard
7. Verify: User name displayed in header
8. Check console: No errors
9. Test edge case: Invalid password
10. Verify: Error message displayed
11. Take screenshots: Success and error states
```

**Insufficient test:**

```
1. curl -X POST /api/login -d '{"email":"test@example.com","password":"correct-password"}'
2. Verify: 200 OK response
❌ Missing: UI verification, visual checks, console errors, edge cases
```

### When to Skip Browser Testing

**Only skip browser_action if:**

- Feature is pure backend (no UI component)
- UI verification is blocked by external dependency
- Project.txt explicitly overrides testing requirements

**In all other cases, browser verification is MANDATORY.**
