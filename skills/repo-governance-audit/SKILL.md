---
name: repo-governance-audit
description: 'Audit and optionally remediate GitHub and local repository governance across configured local roots, including branches, merge and security settings, Actions permissions, remotes, repository discovery, and documented exceptions. Use for repository policy checks.'
metadata:
    aidd-category: audit-remediation
---

# Repository Governance Audit

Audit live state first. Default to report-only mode. Apply remote and local remediation only when
the invocation includes `--apply`; that flag authorizes every evidence-backed change in the reported
batch without a second interaction gate.

## Usage

```text
repo-governance-audit [--apply]
```

## Scope

Use PowerShell 7 and `gh`/`git`; never use `powershell.exe` or Python.

Inspect:

- every source repository owned by the active `gh` account;
- every Git checkout under `<applications-root>`, `<public-root>`, and `<queue-root>`;
- nested repositories and worktrees represented by either a `.git` directory or file.

Read the applicable `AGENTS.md` before acting. Treat archived repositories, private
repositories, forks, mirrors, empty repositories, and repositories owned by a different account
as distinct classes rather than forcing one policy onto all of them.

## Established remote policy

Apply these expectations to active repositories owned by the authenticated GitHub user:

| Setting                             | Expected value |
| ----------------------------------- | -------------- |
| Default branch                      | `main`         |
| Repository Projects                 | disabled       |
| Wiki                                | disabled       |
| Delete branch on merge              | enabled        |
| Merge methods                       | squash only    |
| Auto-merge                          | disabled       |
| Suggest updating PR branches        | enabled        |
| Web commit signoff                  | disabled       |
| Actions default workflow permission | read           |
| Actions may approve PRs             | disabled       |

For active public repositories, also expect:

- secret scanning enabled;
- secret-scanning push protection enabled;
- Dependabot security updates enabled;
- vulnerability alerts enabled when the API exposes them;
- an active `Default branch safety` ruleset targeting `~DEFAULT_BRANCH` with `deletion` and
  `non_fast_forward` rules.

Do not report missing branch rules on active private repositories as remediable drift when the
account plan rejects both rulesets and classic branch protection. Report it as a plan-limited
exception.

## Intentional exceptions

Treat these as accepted unless current evidence or the user changes the decision:

- Issues disabled: `awesome-htmx`, `eskew-ale`, `stars`.
- Discussions enabled: `aidd`, `htmx-debugger`, `podex`, `spernakit`.
- Archived repositories may retain `master` and do not need active-repository merge or cleanup
  settings.
- GitHub disables push protection and Dependabot security updates when a public repository is
  archived; report this as platform behavior, not actionable drift.
- Repositories owned by another GitHub account are inventory items, not remediation targets.
- A non-`origin` remote is not automatically wrong. Preserve it unless `--apply` is set and live
  evidence establishes that it is obsolete and unused.

If an exception target no longer exists, is no longer archived, or changes purpose, flag the
exception itself for review.

## Audit workflow

### 1. Establish authentication and inventory

1. Run `gh auth status` and identify the active account and available scopes.
2. Query all owned source repositories with pagination.
3. Recursively find `.git` markers under all three local roots.
4. Deduplicate local repositories by resolved worktree path.
5. Report counts by active/archived, public/private, and local current branch.

Never infer GitHub ownership solely from a directory name. Parse remote URLs and query the live
repository when a remote exists.

### 2. Audit GitHub general settings

For every owned repository, read the full repository endpoint rather than relying only on list
results. Compare active repositories with the established policy. Verify archived state before
classifying exceptions.

Audit separately:

- Issues and Discussions against intentional exceptions;
- Pages and environments as informational deployment-specific settings;
- visibility, forks, templates, and mirrors as informational classifications;
- default branch, merge settings, cleanup, Projects, Wiki, and web signoff as policy fields.

### 3. Audit Actions permissions safely

Read both repository Actions permission endpoints.

Flag:

- default workflow permission other than `read`;
- Actions allowed to approve pull requests;
- Actions disabled unexpectedly;
- broad allowed-actions policy as advisory only unless the user establishes a stricter policy.

Before recommending a permission reduction, inspect every workflow for explicit `permissions`
and for releases, package publishing, Pages deployment, PR automation, or API writes. Never
break a workflow that relies on implicit permission without first adding the minimum explicit
permission in the repository.

### 4. Audit security and branch rules

For public repositories, inspect `security_and_analysis`, vulnerability alerts, automated
security fixes, and rulesets. Verify the baseline ruleset's enforcement, target, condition, and
rule types rather than checking only its name.

Report private-repository rule limitations separately. Do not propose changing visibility to
obtain branch rules.

### 5. Audit local Git state

For every local checkout, record:

- path, current branch, all local branches, and detached state;
- upstream and ahead/behind counts;
- every remote URL and remote default branch;
- stale `*/master` and deleted remote-tracking references;
- dirty-entry count without printing sensitive file contents;
- whether the remote's live default branch matches the local branch and upstream.

Classify non-`main` branches as:

1. owned active GitHub repository drift;
2. archived repository exception;
3. differently owned remote requiring separate authorization;
4. standalone local repository safe to rename locally;
5. feature or worktree branch that must not be normalized.

Branch renaming must preserve dirty files. Never stash, reset, clean, discard, or rewrite user
changes. Do not delete a branch until ancestry and default-branch state are verified.

### 6. Detect new repositories

Do not depend on a hard-coded repository list. Newly discovered owned GitHub repositories and
local `.git` markers automatically enter the audit.

Call out as new or uncatalogued when any of these apply:

- an owned GitHub repository has no matching known local checkout and appears recently created;
- a local repository is absent from the nearest `AGENTS.md` application inventory;
- a local remote points to an owned GitHub repository not otherwise represented in the workspace;
- duplicate local checkouts point to the same remote;
- a repository changes owner, visibility, archive state, or remote URL.

If a prior audit report is available, compare inventories and list additions/removals explicitly.
Do not create a persistent snapshot unless the user requests one.

### 7. Report before remediation

Lead with a compact status:

- compliant controls;
- actionable drift;
- intentional exceptions;
- plan/platform limitations;
- new or uncatalogued repositories;
- local-only anomalies.

Group remediation into small, reversible batches and state exact repositories and effects. In
`--apply` mode, continue directly; otherwise finish with the report.

### 8. Remediate and verify

In `--apply` mode:

1. Re-read targets immediately before mutation.
2. Preserve archived state; temporarily unarchive only when required and re-archive in `finally`.
3. Apply the smallest evidence-backed change.
4. Verify every target and the account-wide invariant.
5. Re-scan affected local repositories.
6. Report partial failures precisely; never imply a rejected update succeeded.

When GitHub changes a default branch, update matching local branch names, upstreams, and remote
HEAD references only in `--apply` mode. Use pruned fetches to remove stale tracking references.

## Completion criteria

The audit is complete only when:

- all owned remote repositories and all local checkouts were inventoried;
- each policy field was checked or explicitly marked unavailable;
- new repositories and ownership mismatches were classified;
- intentional exceptions were separated from drift;
- no mutation occurred outside `--apply` mode;
- applied remediations received live remote and local verification.
