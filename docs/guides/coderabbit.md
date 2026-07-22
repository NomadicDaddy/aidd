# CodeRabbit Integration

[CodeRabbit](https://www.coderabbit.ai/) is an external AI code-review service. aidd integrates
with it in two complementary ways, both opt-in and both requiring tools **you** install and
authenticate — aidd never holds CodeRabbit or GitHub credentials:

1. **Local reviews** — the `coderabbit` skill runs the CodeRabbit CLI against a
   project's pending changes and remediates confirmed findings, before anything is pushed.
2. **Pull-request reviews** — the CodeRabbit GitHub App reviews PRs in the cloud; the
   `coderabbit-pr` skill pulls that feedback back down via the GitHub CLI and
   remediates it.

> **Privacy note:** both paths send code to external services. The CLI uploads the diff to
> CodeRabbit's cloud for analysis; the GitHub App reads the PR on GitHub. Only enable them for
> projects where that is acceptable.

## Local reviews with the CodeRabbit CLI

### Prerequisites

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

### What the skill does

Run the `coderabbit` skill as a one-shot with the target application and optional `base`
branch arguments. It:

1. Resolves the base branch (`base` parameter, else `main`/`master`) and confirms there is
   something to review.
2. Runs `coderabbit review --plain --base <base>` in the foreground (reviews can take several
   minutes).
3. Triages every finding against the actual code: fixes the ones judged real, dismisses false
   positives with a one-line justification each.
4. Runs the project's quality gate (`bun run smoke:qc` when present, else the project's own
   build/lint scripts).
5. Reports fixed findings, dismissed findings with justifications, and the gate result.

It never pushes or posts anywhere; it only edits the working tree.

### Costs and limits

CodeRabbit's free tier has daily review limits; paid plans meter usage per reviewed file beyond
plan quotas. When the CLI reports a rate limit, the skill stops and surfaces it instead of
retrying.

## Pull-request reviews with the GitHub App

### Prerequisites

- The [CodeRabbit GitHub App](https://github.com/apps/coderabbitai) installed on the repository
  (free for public repositories). Once installed, CodeRabbit reviews every PR automatically —
  no aidd involvement.
- The GitHub CLI (`gh`), installed and logged in by you (`gh auth login`).

### The loop

1. Push a branch and open a PR (yourself, or from an aidd run that ends in a PR).
2. CodeRabbit reviews it in the cloud and leaves inline comments, review summaries, and
   conversation comments as `coderabbitai[bot]`.
3. Run the `coderabbit-pr` skill as a one-shot with the target application and optional
   `pr` number (defaulting to the current branch's open PR). It collects all three feedback
   surfaces via `gh api`, triages each finding, fixes the real ones, runs the quality gate, and
   commits.
4. Review the commit and push it yourself: the skill deliberately never pushes and never
   replies to or resolves PR threads.

Findings that need a human call (product decisions, tradeoffs) are listed in the run summary
rather than guessed at.

## Choosing between them

- Use the **CLI skill** for pre-push review inside pipelines — e.g. after a coding step,
  the way `deepreview` is used, but with CodeRabbit as an independent second reviewer.
- Use the **GitHub App + `coderabbit-pr`** on repositories with a PR-based workflow; it costs
  nothing to set up and reviews arrive without any local CLI or WSL requirement.

They are complementary: one reviews before the push, the other after.
