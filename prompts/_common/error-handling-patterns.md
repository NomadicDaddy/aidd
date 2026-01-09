## APPENDIX: ERROR HANDLING PATTERNS

**Comprehensive guide to recognizing, diagnosing, and recovering from common errors.**

### Error Recovery Philosophy

**Three-Strike Rule:**

1. **First failure:** Fix the specific error, retry
2. **Second failure:** Change approach entirely, retry
3. **Third failure:** Abort feature, document, move to next

**Never:**

- Get stuck in infinite error-fixing loops
- Ignore errors hoping they'll resolve
- Proceed with broken builds
- Mark features as passing with failures

---

## Code Quality Errors

### Pattern: TypeScript Syntax Errors (100+ errors)

**Symptoms:**

```
error TS1005: '}' expected.
error TS1109: Expression expected.
error TS1128: Declaration or statement expected.
... (98 more similar errors)
```

**Common Causes:**

- Malformed code from bad file write
- Unterminated strings or brackets
- Invalid escape sequences in regex
- Corruption during edit

**Recovery:**

1. **First attempt:** Read the file, identify specific syntax issue
2. **If numerous cascading errors:** File is likely corrupted
3. **Rollback:** `git checkout -- <file>`
4. **Rewrite completely:** Use simpler approach
5. **Verify:** Run `npm run type-check` after fix

**Example:**

```typescript
// ❌ CORRUPTED (unterminated regex)
const pattern = /TODO:.*/

// ✅ FIXED (proper escaping)
const pattern = /TODO:.*$/
```

---

### Pattern: Unterminated Regex Literal

**Symptoms:**

```
error TS1161: Unterminated regular expression literal.
```

**Common Causes:**

- Bad escape sequences in regex patterns
- Unescaped special characters
- Mixing regex with string literals

**Recovery:**

1. **Extract regex to separate variable:**

    ```typescript
    // ❌ WRONG
    const match = content.match(/TODO: .*/g)

    // ✅ CORRECT
    const todoPattern = new RegExp('TODO: .*', 'g')
    const match = content.match(todoPattern)
    ```

2. **Use string literals instead:**

    ```typescript
    // Alternative: Use simple string includes
    if (content.includes('TODO:')) { ... }
    ```

3. **Test regex separately before using**

---

### Pattern: Missing Imports/Exports

**Symptoms:**

```
error TS2305: Module '"./utils"' has no exported member 'helper'.
error TS2307: Cannot find module './config' or its corresponding type declarations.
```

**Common Causes:**

- Forgot to add import statement
- Wrong import path
- Module not exported
- Circular dependencies

**Recovery:**

1. **Check if module exists:** `mcp_filesystem_read_text_file` the target file
2. **Verify export exists:** Look for `export` keyword
3. **Fix import path:** Ensure path is correct (relative vs absolute)
4. **Add missing export:** If function exists but not exported
5. **Check package.json:** If external package, verify it's installed

**Example:**

```typescript
// ❌ WRONG
import { helper } from './utils';
// ✅ CORRECT (after checking utils.ts)
import { helperFunction } from './utils/helpers';
```

---

### Pattern: Type Mismatches

**Symptoms:**

```
error TS2322: Type 'string' is not assignable to type 'number'.
error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'string'.
```

**Common Causes:**

- Wrong type annotation
- Missing null checks
- Incorrect function signature
- Type inference issues

**Recovery:**

1. **Remove type annotation** (let TypeScript infer):

    ```typescript
    // ❌ WRONG
    const count: string = items.length

    // ✅ CORRECT
    const count = items.length // TypeScript infers number
    ```

2. **Add explicit cast** (if you're certain):

    ```typescript
    const value = data as unknown as TargetType;
    ```

3. **Fix the actual type:**

    ```typescript
    // ✅ BEST: Fix the root cause
    const count: number = items.length;
    ```

4. **Add null checks:**
    ```typescript
    // ✅ Handle undefined
    const value = data?.field ?? 'default';
    ```

---

### Pattern: ESLint Errors

**Symptoms:**

```
error  'React' is defined but never used  no-unused-vars
error  Missing return type on function  @typescript-eslint/explicit-function-return-type
```

**Common Causes:**

- Code style violations
- Unused variables
- Missing type annotations
- Inconsistent formatting

**Recovery:**

1. **Follow existing patterns in codebase:**
    - Read similar files
    - Match their style
    - Use same conventions

2. **Remove unused imports:**

    ```typescript
    // ❌ WRONG
    import React, { useState } from 'react' // React unused

    // ✅ CORRECT
    import { useState } from 'react'
    ```

3. **Add missing annotations:**

    ```typescript
    // ❌ WRONG
    function calculate(a, b) {
    	return a + b;
    }

    // ✅ CORRECT
    function calculate(a: number, b: number): number {
    	return a + b;
    }
    ```

4. **Run auto-fix if available:**
    ```bash
    npm run lint -- --fix
    ```

---

## Build and Tooling Errors

### Pattern: Missing Configuration Files

**Symptoms:**

```
Error: Could not find a ESLint configuration file.
Error: Cannot find module 'eslint-config-next'
```

**Common Causes:**

- Configuration file deleted
- Wrong directory
- Missing dependencies
- Initialization not complete

**Recovery:**

1. **Create missing config file:**

    ```bash
    # For ESLint
    # Create .eslintrc.js or eslint.config.js
    ```

2. **Install missing dependencies:**

    ```bash
    npm install --save-dev eslint-config-next
    ```

3. **Copy from similar project:**
    - Find working config from template
    - Adapt to current project

4. **Check project.txt for overrides:**
    - May specify custom config location
    - May disable certain tools

**Example .eslintrc.js:**

```javascript
module.exports = {
	extends: ['next/core-web-vitals'],
	rules: {
		// Project-specific rules
	},
};
```

---

### Pattern: Build Failures

**Symptoms:**

```
Build failed with errors:
ERROR in ./src/App.tsx
Module not found: Error: Can't resolve './component'
```

**Common Causes:**

- Missing files
- Wrong import paths
- Dependency issues
- Configuration problems

**Recovery:**

1. **Verify file exists:**

    ```bash
    mcp_filesystem_read_text_file src/component.tsx
    ```

2. **Fix import path:**

    ```typescript
    // ❌ WRONG
    import Component from './component'

    // ✅ CORRECT
    import Component from './components/Component'
    ```

3. **Clear build cache:**

    ```bash
    rm -rf node_modules/.cache
    npm run build
    ```

4. **Reinstall dependencies:**
    ```bash
    rm -rf node_modules package-lock.json
    npm install
    ```

---

## Git and Version Control Errors

### Pattern: Git Merge Conflicts

**Symptoms:**

```
error: Your local changes to the following files would be overwritten by merge:
    src/App.tsx
```

**Common Causes:**

- Concurrent edits
- Diverged branches
- Uncommitted changes

**Recovery:**

1. **Check git status:**

    ```bash
    git status
    ```

2. **Commit current work:**

    ```bash
    git add .
    git commit -m "WIP: Save before merge"
    ```

3. **Pull with rebase:**

    ```bash
    git pull --rebase origin main
    ```

4. **Resolve conflicts manually:**
    - Read conflicted files
    - Choose correct version
    - Remove conflict markers (<<<<, ====, >>>>)
    - Test after resolution

5. **Complete merge:**
    ```bash
    git add .
    git rebase --continue
    ```

---

### Pattern: Git Not a Repository

**Symptoms:**

```
fatal: not a git repository (or any of the parent directories): .git
```

**Common Causes:**

- Working in wrong directory
- Git not initialized
- `.git` directory deleted

**Recovery:**

1. **Check current directory:**

    ```bash
    pwd
    mcp_filesystem_list_directory .
    ```

2. **Initialize git if needed:**

    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```

3. **Verify project root:**
    - Ensure you're in the correct directory
    - Check for `/.aidd/` marker

4. **Document issue:**
    - Note in progress.md
    - Continue with feature work if git is optional

---

## Database and Schema Errors

### Pattern: Migration Failures

**Symptoms:**

```
Error: Migration failed: Table 'users' already exists
Error: Cannot add column 'email': column already exists
```

**Common Causes:**

- Duplicate migrations
- Schema out of sync
- Manual database changes
- Failed previous migration

**Recovery:**

1. **Check migration status:**

    ```bash
    npx prisma migrate status
    ```

2. **Roll back failed migration:**

    ```bash
    npx prisma migrate resolve --rolled-back [migration-name]
    ```

3. **Fix migration code:**
    - Review migration file
    - Remove duplicate operations
    - Test changes

4. **Re-apply migration:**

    ```bash
    npx prisma migrate dev
    ```

5. **Verify schema:**
    ```bash
    npx prisma db push --accept-data-loss
    ```

---

### Pattern: Duplicate Schema Models

**Symptoms:**

```
Error: Model "User" is defined multiple times
```

**Common Causes:**

- File editing errors
- Copy-paste mistakes
- Merge conflicts

**Recovery:**

1. **Read schema file:**

    ```bash
    mcp_filesystem_read_text_file prisma/schema.prisma
    ```

2. **Search for duplicates:**

    ```bash
    mcp_filesystem_search_files pattern="model User" path="prisma/"
    ```

3. **Rollback if corrupted:**

    ```bash
    git checkout -- prisma/schema.prisma
    ```

4. **Reapply changes carefully:**
    - Make single targeted edit
    - Verify immediately
    - Test schema compilation

---

## Service and Runtime Errors

### Pattern: Service Won't Start

**Symptoms:**

```
Error: listen EADDRINUSE: address already in use :::5173
```

**Common Causes:**

- Port already in use
- Previous instance still running
- Missing environment variables
- Configuration errors

**Recovery:**

1. **Check if service already running (REUSE IT!):**

    ```bash
    # Linux/Mac
    lsof -ti:5173

    # Windows
    netstat -ano | findstr :5173

    # Test connection
    curl http://localhost:5173
    ```

2. **If service is running:** Use existing service
    - Don't kill and restart unnecessarily
    - Note the port number
    - Proceed with testing

3. **If service crashed:** Check logs

    ```bash
    cat dev.log
    cat vite.log
    ```

4. **If port conflict:** Use different port

    ```bash
    # Start on different port
    PORT=5174 npm run dev &
    ```

5. **Kill old process only if necessary:**

    ```bash
    # Linux/Mac
    kill $(lsof -ti:5173)

    # Windows
    # Find PID: netstat -ano | findstr :5173
    # Kill: taskkill /PID [pid] /F
    ```

---

### Pattern: Missing Environment Variables

**Symptoms:**

```
Error: DATABASE_URL environment variable not set
Error: API_KEY is required but not provided
```

**Common Causes:**

- `.env` file missing
- Variables not loaded
- Wrong environment
- Typo in variable name

**Recovery:**

1. **Check for .env file:**

    ```bash
    mcp_filesystem_list_directory .
    mcp_filesystem_read_text_file .env
    ```

2. **Create .env if missing:**

    ```bash
    # Based on .env.example
    mcp_filesystem_read_text_file .env.example
    # Create .env with required values
    ```

3. **Verify variable names:**
    - Check for typos
    - Ensure correct case
    - Match examples exactly

4. **Load environment:**
    ```bash
    # Some frameworks require restart after .env changes
    npm run dev
    ```

---

## Browser Automation Errors

### Pattern: Browser Timeout

**Symptoms:**

```
Error: Timeout waiting for element "Login Button"
Error: Navigation timeout exceeded
```

**Common Causes:**

- Frontend not running
- Wrong URL/port
- Element selector wrong
- Page loading slowly

**Recovery:**

1. **Verify frontend is running:**

    ```bash
    curl http://localhost:3330
    ```

2. **Check correct port:**
    - Review dev.log
    - Check package.json scripts
    - Try common ports (3000, 3330, 5173)

3. **Take screenshot to see actual state:**

    ```
    browser_action.screenshot "debug"
    ```

4. **Add wait/retry logic:**
    - Wait for page load
    - Use more specific selectors
    - Increase timeout if needed

5. **Fall back to API testing if UI blocked:**
    ```bash
    curl -X POST http://localhost:3331/api/login -d '...'
    ```

---

### Pattern: Element Not Found

**Symptoms:**

```
Error: Could not find element matching "Submit Button"
```

**Common Causes:**

- Selector is wrong
- Element not rendered yet
- Element hidden/disabled
- Typo in selector

**Recovery:**

1. **Take screenshot first:**

    ```
    browser_action.screenshot "before-click"
    ```

2. **Try alternative selectors:**

    ```
    # Try different strategies
    browser_action.click "#submit-btn"
    browser_action.click "button[type='submit']"
    browser_action.click "Submit"
    ```

3. **Wait for element to appear:**
    - Page may still be loading
    - JavaScript may render element later
    - Add explicit wait

4. **Check browser console:**
    - May have JavaScript errors
    - Element may have failed to render
    - Look for error messages

---

## Error Resolution Strategy

### General Approach

**For any error:**

1. **Read the full error message carefully**
    - Don't skip error details
    - Identify the specific issue
    - Note file and line numbers

2. **Understand the root cause**
    - Why did this happen?
    - What was I trying to do?
    - What went wrong?

3. **Choose appropriate recovery strategy**
    - First attempt: Fix specific issue
    - Second attempt: Different approach
    - Third attempt: Abort and document

4. **Verify the fix**
    - Re-run failing command
    - Check for cascading errors
    - Test affected functionality

5. **Document if necessary**
    - Note unusual errors in progress.md
    - Record recovery strategy used
    - Help future debugging

### When to Escalate

**Stop and document if:**

- Same error persists after 3 attempts
- Error blocks all progress
- Root cause is unclear
- Fix requires architectural changes
- Dependency/environment issue

**Record in progress.md:**

```markdown
## Blocker: [Error Type]

**Date:** 2026-01-09
**Feature:** [Feature name]
**Error:** [Full error message]
**Attempts:** [What was tried]
**Status:** Deferred pending resolution
**Next:** Moved to [alternative feature]
```

---

## Prevention Best Practices

### Avoid Errors Before They Happen

1. **Read before writing**
    - Understand existing code
    - Match current patterns
    - Don't guess at structure

2. **Verify after editing**
    - Always read file after edit
    - Check for corruption immediately
    - Test incrementally

3. **Use proper tools**
    - MCP for file operations
    - execute_command for shell ops
    - browser_action for UI testing

4. **Test incrementally**
    - Small changes, test often
    - Don't batch multiple changes
    - Verify each step

5. **Follow patterns**
    - Match existing code style
    - Use same conventions
    - Copy working examples

6. **Check before committing**
    - Run quality checks
    - Review git diff
    - Test all changes
