---
name: coderabbit
description: 'Review pending changes with the CodeRabbit CLI: review the branch diff and working tree, fix findings judged real, dismiss false positives with justification, then run the quality gate. Use for CodeRabbit reviews of local changes.'
metadata:
    aidd-category: runtime
---

# CodeRabbit Review

Run the CodeRabbit CLI against the target application's pending changes, triage every finding,
fix the ones that are real, and dismiss the rest with a written justification. CodeRabbit is an
external cloud review service: the CLI sends the diff to CodeRabbit for analysis, so only use
this skill on projects whose owner is comfortable with that.

## Usage

```
coderabbit [appname] [base]
```

If `[appname]` is omitted, infer from the current working directory. `[base]` is the branch to
compare against; when omitted, use `main` if it exists (locally or as `origin/main`), otherwise
`master`.

## Setup

1. Check if the CodeRabbit CLI is available:
    - Run `coderabbit --version` to test.
    - On Windows the official CLI does not run natively; if the native probe fails, try WSL:
      `wsl -e coderabbit --version`. If WSL has it, run every subsequent CodeRabbit command
      through WSL against the project's mount path, e.g.
      `wsl -e sh -c "cd /mnt/d/path/to/project && coderabbit review --plain"`
      (translate `D:\path\to\project` to `/mnt/d/path/to/project`).
2. If neither probe succeeds, STOP and report exactly what is missing instead of failing
   cryptically. Setup guidance to include in the report:
    - Install (macOS/Linux/WSL): `curl -fsSL https://cli.coderabbit.ai/install.sh | sh`
    - Log in: `coderabbit auth login` (interactive; the user must do this themselves)
    - On Windows, both steps happen inside WSL.
3. Verify the CLI is logged in by checking `coderabbit auth status` (through WSL if applicable).
   If not logged in, STOP with the same guidance; never attempt the interactive login yourself.

## Workflow

### Step 1: Resolve scope

- Determine the base ref: use the `[base]` argument if provided; otherwise `main` (local or
  `origin/main`), else `master`. If none exists, review only uncommitted changes.
- Confirm there is something to review (`git status --porcelain` and
  `git log <base>..HEAD --oneline`). If both are empty, report "nothing to review" and stop.

### Step 2: Run the review

```bash
coderabbit review --plain --base <base>
```

- This is a long-running command: reviews commonly take several minutes. Run it in the
  foreground with a generous timeout (at least 15 minutes) and wait for it to complete; do not
  background it.
- Capture the full output. If it must be persisted for reference, write it to the OS temp
  directory, never into the reviewed working tree.
- If the CLI reports a rate limit (the free tier has daily limits), report that and stop; do not
  retry in a loop.

### Step 3: Triage every finding

For each finding, judge it against the actual code (read the file, do not trust the excerpt
alone):

- **Real**: the issue exists and matters. Queue it for a fix.
- **False positive or not applicable**: dismiss it with a one-line justification (e.g. "guarded
  two lines above", "intentional per project convention X").

Respect the repository's own conventions when judging: a pattern the project uses deliberately
is not a finding.

### Step 4: Fix the real findings

- Apply fixes for every finding judged real, smallest change that resolves the issue.
- Do not refactor beyond the finding's scope.

### Step 5: Quality gate

- If the project's package.json defines a `smoke:qc` script, run `bun run smoke:qc`.
- Otherwise run the project's own build and lint scripts as defined in its package.json.
- Fix any breakage your changes introduced before finishing.

### Step 6: Summary

Report:

- Findings fixed (file, one-line description each)
- Findings dismissed, each with its justification
- Quality-gate result

## Notes

- CodeRabbit's free tier has daily review limits and paid plans meter usage per reviewed file;
  surface any limit errors to the user rather than working around them.
- This skill never pushes, opens PRs, or posts to external services; it only edits the
  working tree and reports.
