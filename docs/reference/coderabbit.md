# CodeRabbit Integration

[CodeRabbit](https://www.coderabbit.ai/) is an external AI code-review service. aidd integrates
with it through the `coderabbit` skill, which runs the CodeRabbit CLI against a project's pending
changes and triages every finding before anything is pushed. Whether the fixes are applied depends
on the run's [execution intent](../../frontend/content/docs/skills.md#run-a-skill): `apply-changes` edits the working
tree, `review-only` reports the changes it would have made. The integration is opt-in and requires
tools **you** install and authenticate — aidd never holds CodeRabbit credentials.

> **Privacy note:** the CLI uploads the diff to CodeRabbit's cloud for analysis. Only enable it for
> projects where that is acceptable.

## Prerequisites

- The CodeRabbit CLI, installed and logged in **by you**:

    ```bash
    curl -fsSL https://cli.coderabbit.ai/install.sh | sh
    coderabbit auth login
    ```

- **Windows:** the official CLI supports macOS, Linux, and WSL only — there is no native Windows
  build. Install and log in inside WSL; the skill probes native `coderabbit` first and
  falls back to running it through WSL against the project's `/mnt/<drive>/...` path
  automatically. If neither is available, the run stops with setup guidance rather than failing
  cryptically.

## What the skill does

Run the `coderabbit` skill as a one-shot — `coderabbit [app] [base-ref]` — with the target
application and an optional base ref. It:

1. Resolves the base ref (the `[base-ref]` argument, else `main` locally or as `origin/main`, else
   `master`; with none of those it reviews only uncommitted changes) and confirms there is
   something to review.
2. Runs `coderabbit review --plain --base <base>` when a base ref resolves, or
   `coderabbit review --plain` when only uncommitted changes are available. The review stays in
   the foreground and can take several minutes.
3. Triages every finding against the actual code: fixes the ones judged real, dismisses false
   positives with a one-line justification each. Under `review-only`, the fixes are described
   rather than applied.
4. Runs the project's quality gate (`bun run smoke:qc` when present, else the relevant build,
   typecheck, lint, format-validation, and test scripts).
5. Reports fixed findings, dismissed findings with justifications, and the gate result.

It never pushes, opens a pull request, or posts review comments. Apart from the disclosed diff
upload to CodeRabbit, its only possible project mutation is editing the working tree.

## Costs and limits

CodeRabbit's free tier has daily review limits; paid plans meter usage per reviewed file beyond
plan quotas. When the CLI reports a rate limit, the skill stops and surfaces it instead of
retrying.

## Where it fits

Use the skill for pre-push review inside pipelines — e.g. after a coding step, the way
`deepreview` is used, but with CodeRabbit as an independent second reviewer. The bundled
[`coding-spirit-coderabbit-document-changes`](./recipes.md#coding-spirit-coderabbit-document-changes)
recipe does exactly that: coding, a spirit review and its remediation, then the `coderabbit` skill
`review-only` followed by a remediation step that consumes its findings, then `document-changes`.

The [CodeRabbit GitHub App](https://github.com/apps/coderabbitai) is a separate product that
reviews pull requests in the cloud with no aidd involvement at all. It remains a reasonable choice
for PR-based workflows, but aidd ships no skill for pulling its feedback back down; remediate those
comments the way you would any other PR review.
