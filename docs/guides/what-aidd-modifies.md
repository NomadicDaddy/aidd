# What aidd Can Modify

aidd is a local tool. It runs on your machine, works against project folders you point it at, and
talks to an AI backend you configure. This page is the plain-English inventory of everything it
reads, writes, runs, and sends over the network, so you can decide what to hand it with your eyes
open.

The short version: aidd only writes inside the project you give it (plus its own control-panel data
and logs), it never sends analytics or "phones home", and the two things worth understanding before
you trust it with a project are **code-changing runs** and **recipe shell steps**. Both are covered
below.

## Your project's `.aidd/` metadata

Every managed project has an `.aidd/` directory that aidd owns. This is where it keeps the spec,
feature records, run history, and reports:

| Path                                | What it is                                                         |
| ----------------------------------- | ------------------------------------------------------------------ |
| `.aidd/spec.md`                     | Your project spec (written once at onboarding, then yours to edit) |
| `.aidd/features/<id>/feature.json`  | One file per tracked feature                                       |
| `.aidd/roadmap.json`                | Feature-to-milestone mapping                                       |
| `.aidd/CHANGELOG.md`                | Per-change log aidd appends to                                     |
| `.aidd/runs.jsonl`                  | The run ledger: one line per run                                   |
| `.aidd/iterations/*.log` / `*.json` | Per-iteration output and metadata                                  |
| `.aidd/audit-reports/*.md`          | Audit reports                                                      |
| `.aidd/audits/`, `.aidd/_common/`   | Audit definitions and templates copied in from aidd                |
| `.aidd/.stop`                       | The stop signal (see [Stopping a run](#stopping-a-run))            |

The `.aidd/` write boundary is **mechanically enforced**. During a run aidd
snapshots the tree, and if an iteration writes somewhere it shouldn't, the change is reverted; a
second violation fails the run outright. Metadata-only work (audits, the web pipeline's read-only
steps) is held to an `.aidd`-only allowlist by the same guard.

## Your project's source code

aidd only edits your actual source in **code-changing modes**: a normal `coding` run, a `directive`
that asks for changes, or a `triumvirate` run. In those modes the AI backend edits files to do the
work you asked for, exactly like a developer would.

Everything else is **read-only** on your code: audits, `--check-features` / `--check-artifacts`,
interview, and the web pipeline's metadata-only steps.

The one time aidd adds files on its own is **scaffolding a fresh project**, and even then it only
fills in what's _missing_: starter config like `.editorconfig`, `.gitignore`, `.prettierrc`,
`eslint.config.js`, a `package.json`, and a `frontend/` skeleton. It never overwrites files you
already have.

Deploy configuration (a `Dockerfile`, `wrangler.toml`, CI workflow, …) is never emitted
autonomously. It comes only from the `deployment-readiness` skill — a code-changing
directive run you launch yourself (one-shot or via the maturity ladder's Shipped stage) — and
that skill also only fills in what's missing, never overwriting existing config. The
bundled `deploy` recipe runs your project's own `deploy` script; aidd never stores or handles
deploy credentials.

## Git

- **Init:** aidd runs `git init` on a fresh project **only** if you pass `--init-git-after-scaffold`
  (the web "create project" flow opts in). If git isn't installed it skips this and carries on.
- **aidd makes no commits of its own.** It never auto-commits your source code, and as of
  2026-07-16 it no longer commits the run ledger either. `.aidd/runs.jsonl` records unreviewed
  run metadata — AI-written summaries, commit subjects, file paths, token and cost totals — which
  is ignored in every profile and never committed. Earlier versions recorded it as a follow-up
  commit; that flow has been removed.
- **Agent commits:** in a code-changing run, the AI backend may commit the work it just did. Those
  commits are the agent doing the task you asked for, not aidd committing behind your back.
- **Worktrees:** runs configured with `--worktree` execute in a throwaway git worktree (under your
  temp dir, or the panel's data dir) on a `aidd/run-<id>` branch, which is removed when the run ends.
- The AI backend is **blocked** from destructive git (`git reset --hard`, `git checkout .`,
  `git clean -fdx`) so it can't wipe your working tree.

## Configuration

aidd reads two config files:

- `~/.aidd/config.json`: your user-level settings (roots, default backend/model, web options)
- `<project>/.aidd/aidd.config.json`: optional per-project overrides

The per-project file is yours alone — aidd **never writes it**. The user-level file you can also
edit by hand, but saving the web **Settings** page rewrites it: the panel writes the merged result
back to `~/.aidd/config.json` with owner-only permissions (`0600`, in a `0700` directory), because
that file holds your provider API keys, `web.authToken`, and the Telegram bot token. Secret values
are never read back out to the browser — the Settings page shows them as set-or-unset.

## The control panel's data and logs

When you run the web control panel it keeps its state next to the binary (or under `web.dataDir`):

- `data/aidd-panel.db`: a local SQLite database holding run and invocation history, pipeline
  sessions, director state, diary index, system and browser metrics, and UI settings. Single-writer
  locked. System and browser samples are retained for up to 30 days.
- `logs/backend.pid`: the running backend's PID
- `logs/ai-calls.jsonl`: a local log of AI-call timing, provider/model, endpoint host, request size,
  success/error details, source/surface, optional project/run identity and token counts, and
  **never prompt text or model output**. It rotates at 10 MB with at most five archived files.
- per-run execution logs and heartbeat files under the data dir

All of it is local. None of it leaves your machine.

## Recipe shell steps

Recipes can include `shell` steps that run **arbitrary commands**. This is the riskiest thing aidd
will do on your behalf, so it's worth understanding:

- Shell steps run `bash` with their working directory **confined to your configured `allowedRoots`**.
  A step whose directory falls outside those roots fails before anything runs.
- The environment is filtered to a narrow allowlist plus your provider keys.
- Recipes are **operator-authored**: you (or a template you installed) write them. The AI agent
  cannot author or inject recipes; it only runs the steps you defined.

Separately, when the agent itself uses a shell tool, a policy blocks home-directory access
(`$HOME`/`$USERPROFILE`), environment dumps, and the destructive git commands noted above.

## Agent backends and network

aidd runs whatever backend you choose:

- **External CLIs** (`claude`, `cline`, `opencode`, `kilo`, `codex`, `grok`): aidd spawns the tool
  you installed and authenticated. That tool's own network activity is outside aidd's control.
- **Native backend:** aidd makes the model calls itself, as direct HTTPS requests to the
  OpenAI-compatible provider you configure (e.g. Zhipu, xAI, a local Ollama). Your API key comes from
  your config or environment and is sent only in the request's auth header, never logged or printed.

The only network egress aidd initiates is to that model provider. The optional Telegram bridge, if
you enable it, sends director-chat messages to the Telegram API you configured. The optional
CodeRabbit skills (`coderabbit`, `coderabbit-pr`) are opt-in per launch: when **you** run
them, the agent invokes the CodeRabbit CLI (which uploads the project's diff to CodeRabbit's
cloud service for review) and the GitHub CLI (which calls the GitHub API) — both tools you
installed and authenticated yourself; see [coderabbit.md](./coderabbit.md). aidd records
invocation telemetry (token counts, durations, outcomes) for its usage dashboard, but that data
**stays in your local database**. There is **no external telemetry, no analytics, and no "phone
home"** anywhere in aidd.

## Stopping a run

- **CLI:** press `Ctrl+C`. aidd writes `<project>/.aidd/.stop`, finishes the current iteration, and
  exits cleanly. The stop file is cleared at the start of the next run.
- **Web:** use the **Stop** control on the run; the same stop mechanism applies.

## What aidd does not do

- It does not write outside the project you point it at, except its own `data/`/`logs/` and
  `~/.aidd/config.json` when you save the Settings page.
- It does not overwrite your existing files during scaffolding.
- It does not auto-commit your source code.
- It does not send telemetry, usage analytics, or any data to us or a third party. Its usage
  telemetry stays local, and the only outbound calls are to the model provider (and Telegram) that
  you configure.
- On uninstall, deleting the aidd binaries leaves every project's `.aidd/` untouched (see the
  [deployment guide](./deployment.md#uninstall)).
