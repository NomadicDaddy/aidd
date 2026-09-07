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
| `.aidd/findings-ledger.jsonl`       | Append-only audit-finding lifecycle events                         |
| `.aidd/runs.jsonl`                  | The run ledger: one line per run                                   |
| `.aidd/iterations/*.log` / `*.json` | Per-iteration output and metadata                                  |
| `.aidd/audit-reports/*.md`          | Audit reports                                                      |
| `.aidd/audits/`, `.aidd/_common/`   | Audit definitions and templates copied in from aidd                |
| `.aidd/.stop`                       | The stop signal (see [Stopping a run](#stopping-a-run))            |

Metadata-only work is held to that boundary **mechanically**. The web pipeline's read-only steps,
and any CLI run launched with `--write-allowlist .aidd`, declare an `.aidd`-only allowlist: aidd
snapshots the git worktree before the backend runs, reverts anything written outside the allowlist,
retries the iteration once with the violation named in the prompt, then fails the run (exit 76) if
it happens again. A triumvirate run skips the retry and fails on the first violation. A plain
coding run declares no allowlist — changing your source is the point of it.

## Your project's source code

aidd only edits your actual source in **code-changing modes**: a normal `coding` run, a `todo` run,
a `directive` that asks for changes, or a `triumvirate` run. In those modes the AI backend edits
files to do the work you asked for, exactly like a developer would.

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
skill may add a missing `deploy` script to `package.json` and creates or gap-fills
`.aidd/deployment.md` while preserving its hand-written sections. The bundled `deploy` recipe runs
your project's own `deploy` script; aidd never stores or handles deploy credentials.

## Git

- **Init:** aidd runs `git init` on a fresh project **only** if you pass `--init-git-after-scaffold`
  (the web "create project" flow opts in). If git isn't installed it skips this and carries on.
  Creating a project from a template or GitHub repo is the other init path: aidd shallow-clones the
  source, deletes the template's `.git`, and inits a fresh repository in its place.
- **Git hooks:** wherever aidd creates `.aidd/` in a git repository the project itself owns, it
  copies `.githooks/` in (a `pre-push` guard that blocks a push carrying `.aidd/` metadata, and a
  `pre-commit` secret-leak guard), points the repository's local `core.hooksPath` at `.githooks`,
  and stages those files so they survive a clone. It refuses and leaves everything alone if the
  repository already has its own `core.hooksPath`, real `.git/hooks`, or a `pre-push` aidd did not
  write.
- **aidd makes no commits in a project that already has history.** It never auto-commits your
  source code, and it does not commit the run ledger either. The one commit aidd authors itself is
  the baseline `chore: import ... template baseline` commit in a project it just created from a
  template or GitHub repo, where the template's own history has been stripped and there is nothing
  to disturb. `.aidd/runs.jsonl` records unreviewed
  run metadata — AI-written summaries, commit subjects, file paths, token and cost totals — which
  is ignored in every profile and never committed. `.aidd/findings-ledger.jsonl` is local too: it
  keeps emitted, suppressed, recurred, dismissed, and remediated finding events even after a
  feature directory is removed.
- **Agent commits:** in a code-changing run, the AI backend may commit the work it just did. Those
  commits are the agent doing the task you asked for, not aidd committing behind your back.
- **Worktrees:** runs configured with `--worktree` execute in a throwaway git worktree (under your
  temp dir, or the panel's data dir) on a `aidd/run-<id>` branch, which is removed when the run ends.
- The native agent's shell policy rejects recognized destructive git commands (`git reset --hard`,
  `git checkout .`, `git clean -fdx`). This command-text check is not a guarantee against every way
  executable code can discard work; see the shell boundary below. External backend CLIs apply
  their own permission controls.

## Configuration

aidd reads two config files:

- `~/.aidd/config.json`: your user-level settings (roots, default backend/model, web options)
- `<project>/.aidd/aidd.config.json`: optional per-project overrides

The per-project file is yours alone — aidd **never writes it**. The user-level file you can also
edit by hand, but saving the web **Settings** page rewrites it: the panel writes the merged result
back to `~/.aidd/config.json` with owner-only permissions (`0600`, in a `0700` directory), because
that file may hold your provider API keys, `web.authToken`, and the Telegram bot token. Secret
values are never read back out to the browser — the Settings page shows them as set-or-unset.

Better still, keep the credentials out of the file entirely. Provider keys, `web.authToken`
(`AIDD_WEB_AUTH_TOKEN`), and the Telegram bot token (`AIDD_TELEGRAM_BOT_TOKEN`) can all come from
the environment instead. This matters because an agent asked to inspect your configuration reads
that whole file, and whatever is in it leaves with the answer. Saving the Settings page never
copies an environment-supplied credential into the file. See
[configuration.md](./configuration.md#credentials-in-the-environment).

## The control panel's data and logs

When you run the web control panel it keeps its state under the aidd checkout (or under
`web.dataDir`):

- `data/aidd-panel.db`: a local SQLite database holding run and invocation history, pipeline
  sessions, director state, diary index, system and browser metrics, and UI settings. Single-writer
  locked. System and browser samples are retained for up to 30 days.
- `logs/backend.pid`: the running backend's PID
- `logs/backend.log` and `logs/backend.error.log`: detached backend output. Each active file
  rotates at 10 MiB while the panel is running, with at most five archives retained for no more
  than 30 days.
- `logs/ai-calls.jsonl`: a local log of AI-call timing, provider/model, endpoint host, request size,
  success/error details, source/surface, optional project/run identity and token counts, and
  **never prompt text or model output**. It rotates at 10 MB with at most five archived files.
- per-run execution logs and heartbeat files under the data dir. Terminal transcripts are retained
  for up to 90 days and share a 1 GiB cap; when the cap is exceeded, the oldest terminal
  transcripts are removed first. Logs belonging to active runs are never deleted. Terminal run,
  pipeline-session, and invocation history is retained for up to 365 days.

All of it is local. None of it leaves your machine.

## Recipe shell steps

Recipes can include `shell` steps that run **arbitrary commands**. This is the riskiest thing aidd
will do on your behalf, so it's worth understanding:

- Shell steps run `bash` with a starting directory validated against your configured `allowedRoots`.
  A step whose directory falls outside those roots fails before anything runs. This validates the
  starting directory, not the command's subsequent filesystem access; commands retain the host
  account's permissions and do not pass through the native agent's shell policy.
- The environment is filtered to a narrow allowlist of runtime and shell variables (`PATH`, `HOME`,
  `TEMP`, `SHELL`, …). Provider API keys are **not** among them — those reach backend CLI
  subprocesses only, never a shell step.
- Recipes are **operator-authored**: you (or a template you installed) write them. The AI agent
  cannot author or inject recipes; it only runs the steps you defined.

## Native agent shell boundary

The native agent's Bash tool inspects command text before execution. Its policy rejects recognized
home-directory references (`$HOME`/`$USERPROFILE`), environment dumps, destructive git commands,
and paths it detects escaping the workspace. These are lexical checks, not an operating-system
filesystem sandbox.

**Accepted limitation on Windows:** an interpreter invoked through the tool can construct paths
at runtime and read outside the workspace, including through the inherited home directory.
Filtering environment variables does not remove the real `HOME` and `USERPROFILE` runtime values.
The interpreter escape remains unresolved and is recorded as an accepted risk, not a fixed or
dismissed finding. Treat native shell execution as trusted code running with your account's
permissions. Recipe shell steps use the separate starting-directory check described above;
external backend CLIs use their own permission controls, not this native policy.

## Agent backends and network

aidd runs whatever backend you choose:

- **External CLIs** (`claude`, `cline`, `opencode`, `kilo`, `codex`, `grok`): aidd spawns the tool
  you installed and authenticated. That tool's own network activity is outside aidd's control.
- **Native backend:** aidd makes the model calls itself, as direct HTTPS requests to the
  OpenAI-compatible provider you configure (e.g. Zhipu, xAI, a local Ollama). Your API key comes from
  your config or environment and is sent only in the request's auth header, never logged or printed.

The only network egress aidd initiates on its own is to that model provider. Creating a project
from a template or GitHub repo additionally runs `git clone --depth 1` against the source you named
— at your request, when you ask for that project. The optional Telegram bridge, if
you enable it, sends director-chat messages to the Telegram API you configured. The optional
CodeRabbit skill (`coderabbit`) is opt-in per launch: when **you** run it, the agent invokes the
CodeRabbit CLI (which uploads the project's diff to CodeRabbit's cloud service for review) — a
tool you installed and authenticated yourself; see [coderabbit.md](./coderabbit.md). aidd records
invocation telemetry (token counts, durations, outcomes) for its usage dashboard, but that data
**stays in your local database**. There is **no external telemetry, no analytics, and no "phone
home"** anywhere in aidd.

## Stopping a run

- **CLI:** press `Ctrl+C`. aidd writes `<project>/.aidd/.stop`, finishes the current iteration, and
  exits cleanly. The stop file is cleared at the start of the next run.
- **Web:** use the **Stop** control on the run; the same stop mechanism applies.

## What aidd does not do

- It does not write outside the project you point it at, except its own `data/`/`logs/`,
  per-run worktrees under your temp dir, and `~/.aidd/config.json` when you save the Settings page.
- It does not overwrite your existing files during scaffolding.
- It does not auto-commit your source code.
- It does not send telemetry or usage analytics to us or a third party. Its usage telemetry stays
  local. Outbound content goes only through actions described above: the model provider and
  optional Telegram bridge you configure, a source repository you ask aidd to clone, or the
  opt-in CodeRabbit CLI review whose diff upload is disclosed before use.
- On uninstall, deleting the aidd checkout leaves every project's `.aidd/` untouched (see the
  [deployment guide](./deployment.md#uninstall)).
