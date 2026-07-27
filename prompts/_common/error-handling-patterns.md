## APPENDIX: ERROR HANDLING PATTERNS

**Guide to recovering from errors that need a decision, not just a fix: when to retry, when to change approach, when to stop.**

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

## Build and Tooling Errors

### Pattern: Shell / PATH Resolution Failures (NOT YOUR PROBLEM)

**Symptoms:**

- `bun: The term 'bun' is not recognized as a name of a cmdlet...` (pwsh)
- `command not found: bun` (sh/bash)
- A command works in your shell directly but fails inside a wrapper script
- A `bun run X` step fails inside `smoke:qc` while `bun run X` standalone works

**Why it happens:**

- pwsh `-NoProfile` may not resolve `bun` to `bun.exe` even when `.bun\bin` is on PATH
- The parent shell's PATH/PATHEXT doesn't propagate cleanly into the spawned child
- Wrapper scripts pick a shell different from yours

**This is an environment issue, not a code defect. The right response is to step around it, not fix it.**

**Diagnosis budget: 2 turns max.** Once you've confirmed:

- `which bun` / `where.exe bun` shows the executable exists
- The command works in your current shell
- It only fails inside the wrapper

…stop diagnosing. Do not try 5 variations of pwsh PATH manipulation. Do not edit `scripts/smoke.ts` to "work around it"; that file is template-managed.

**Recovery:**

1. Run the orchestrated steps individually in your working shell (typecheck, lint, build, format are typically all `smoke:qc` chains)
2. Add a one-line note in `CHANGELOG.md` under the current entry (e.g., "smoke:qc fails locally due to env PATH issue; ran steps individually")
3. Continue with feature work; quality gates are still satisfied if the individual steps pass

**Never:**

- Spend more than 2 turns probing `pwsh`, `cmd`, `bash` PATH or PATHEXT
- Switch shells to dodge the problem — wrapping a command in `bash -lc` on Windows usually
  lands in WSL, a separate filesystem and PATH where the project's toolchain is not installed
- Modify template-managed scripts to fix local environment quirks
- Treat this as a feature blocker (it isn't)

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
    bun run db:migrate:status
    ```

2. **Fix migration code:**
    - Review migration file in `backend/drizzle/`
    - Remove duplicate operations
    - Test changes

3. **Apply pending migrations:**

    ```bash
    bun run db:migrate
    ```

4. **For development - push schema directly:**

    ```bash
    bun run --cwd backend db:push
    ```

5. **Reset database (development only):**
    ```bash
    bun run --cwd backend db:reset
    ```

---

## Service and Runtime Errors

### Pattern: Service Won't Start

**Symptoms:**

```
Error: listen EADDRINUSE: address already in use :::3000
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
    lsof -ti:3000

    # Windows
    netstat -ano | findstr :<port>

    # Test connection
    curl <app-url>
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

    **Ownership first:** only stop/restart a server **you started yourself** this session (see the
    Ownership rule in `hard-constraints.md`). If the port is held by the user's already-running
    instance, do **not** stop it; start your own copy on a different port instead, or reuse theirs.

    ```bash
    # Generic: start on different port (npm run dev for non-Bun projects)
    PORT=3001 bun run dev &

    # Spernakit (ONLY if you own this server): set the port in config/spernakit.json, then relaunch
    cd {APP_DIR} && bun run stop && bun run start
    ```

5. **Kill old process only if it is one you started:**

    Confirm the PID/port belongs to a server **you** launched before killing it; never blind-kill
    whatever happens to hold the port, since it may be the user's running app.

    ```bash
    # Linux/Mac
    kill $(lsof -ti:3000)

    # Windows
    # Find PID: netstat -ano | findstr :3000
    # Kill: taskkill /PID [pid] /F
    ```

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
    - First attempt: Fix the specific issue
    - Second attempt: Fundamentally different approach (not a variation of the same fix)
    - Third attempt: Abort and document in CHANGELOG.md
    - **"Different approach" means investigating the root cause from a new angle**, not adding more of the same fix (e.g., more null checks, more filters, more type casts). If the same symptom persists after two fixes, the root cause is elsewhere.

4. **Verify the fix**
    - Re-run failing command
    - Check for cascading errors
    - Test affected functionality

5. **Document if necessary**
    - Note unusual errors in CHANGELOG.md
    - Record recovery strategy used
    - Help future debugging

### When to Escalate

**Stop and document if:**

- Same error persists after 3 attempts
- Error blocks all progress
- Root cause is unclear
- Fix requires architectural changes
- Dependency/environment issue

**Record in CHANGELOG.md:**

```markdown
## Blocker: [Error Type]

**Date:** 2026-01-09
**Feature:** [Feature name]
**Error:** [Full error message]
**Attempts:** [What was tried]
**Status:** Deferred pending resolution
**Next:** Moved to [alternative feature]
```
