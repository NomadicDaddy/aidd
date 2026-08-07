# Changelog

All notable public aidd releases are documented here.

## [2.137.0] - 2026-08-03

### Added

- Cline is a first-class backend, verified against 3.0.47. It arrives with its own command builder,
  NDJSON parser and usage accounting, prompt fragment and snapshots, doctor and settings wiring, and
  success, rate-limit, and malformed fixtures. Docker installs the pinned CLI into the home volume
  on first boot rather than baking it into the published image, and benchmark manifests accept
  `cline` as a backend.
- `backends.<backend>.reasoningEffort` sets a reasoning tier per backend, which takes precedence
  over the provider-scoped one. A project's own `reasoningEffort` is no longer discarded when
  launch config is resolved.
- The Live Console renders a parsed Pretty view behind a session-persisted Pretty/Raw toggle rather
  than dumping raw backend NDJSON. Assistant prose, command cards pairing each start with its
  completion and exit chip, collapsible output, reasoning interstitials, token-usage lines, and
  deduplicated error notes each get their own shape. Find-in-console searches the decoded text, and
  Wrap stays a raw-view control.
- Provider content-policy refusals are their own outcome. They classify as `provider_flagged` with
  orchestrator exit 78 instead of collapsing into the generic provider error, the Runs surfaces
  render a red "Provider flagged" distinct from "Provider error", and Telemetry counts them in a
  new Flagged bucket with its own count card, chart band, legend entry, tooltip, and table column.
  A flagged run is not eligible for transient-provider continuation.
- The Repository tab has a per-file working tree manager: list every changed file and stage,
  unstage, discard, commit selected, commit staged, or reset the index from the selection. Mutating
  routes re-read `git status` and accept only paths that listing currently reports, and every git
  call runs with `--literal-pathspecs`, so a filename that is also a valid pathspec pattern cannot
  widen what a discard touches.
- Audits can pick their launch target from the Audits tab.
- Projects show a seven-day token sparkline.
- Every badge in the Recipes catalog carries an explainer tooltip, in both the table and the card
  view.
- `--skill-intent review-only|apply-changes` states what a skill run is allowed to do. A bare
  `aidd --skill <id>` resolves to the read-only end rather than inheriting the writable default that
  `--prompt` gets, and every other entry point refuses an omission outright: a recipe step is
  rejected at normalization and again at dispatch, and the web one-shot route returns 400.
- Run budgets are editable in Settings under Run Limits: `maxTokens`, `maxCostUsd`, and
  `maxConsecutiveTimeoutRetries`, the last of which existed in every layer except the route body and
  the frontend allowlist and so could never be set from the UI at all. The field help says what
  `maxTokens` is, a cumulative input plus output total for the whole run, warn-only, rather than the
  per-request cap it reads as.
- The orchestrator reconciles the roadmap and the feature contract itself, so skills no longer have
  to reach outside the project to run `roadmap:apply` or `--check-features`. The roadmap's own
  entries drive the sweep, unmapped features are left alone, a structural error aborts every write
  instead of applying half a pass, and template-owned records in a derived app are untouched. The
  contract is validated after each iteration as an advisory carryover note, not a completion gate.
  A read-only run reconciles only to report: it names the drifting records and rewrites none.

### Changed

- Argument-taking bundled skills now publish the same parseable `Usage` contract: a fenced
  invocation beginning with the skill id, `<required>` and `[optional]` placeholders, documented
  flags, and explicit zero-argument defaults where supported. Catalog coverage prevents implicit
  prose-only contracts such as the former `tester` inputs from returning.
- Skill definitions are write-intentional by default. Execution intent is a permission rather than
  an instruction, so a skill body that declared its own read-only boundary kept it under both
  intents and made `apply-changes` a silent no-op. Six review skills now state the fix and apply it,
  leaving the prohibition to `review-only`, where it is enforced.
- Skill runs name the skill in their summary. A skill run is a directive run underneath, so every
  one used to report "directive run finished with exit code N" while the Runs table labelled it
  Skill.
- A compiled skill directive resolves the machine roots it is written against. Tokens like
  `<aidd-root>/skills/...` were handed to agents literally, and they burned turns guessing at a path
  that is not knowable from inside the project. A root the config does not supply is reported as
  unavailable rather than papered over.
- Triumvirate stages run inside the same safety envelope as single-agent runs: wall-clock deadline,
  flailing guard, child-process reaper, and a path from the run controller into an in-flight stage.
  The write allowlist applies to triumvirate runs too, so `--triumvirate` and `--write-allowlist` are
  no longer mutually exclusive. A triumvirate run that previously ran past `--timeout` now aborts at
  the deadline and records exit 124.
- A planning stage must return a real plan. The planning marker is contractual now, matching the
  overseer's validated decision, so refusals, tool narration, or an empty transcript can no longer
  become the approved implementation plan. An exit-zero planner with no usable plan gets one retry
  prompt; a second invalid attempt fails the stage.
- Audit report rejection reasons reach the next iteration. Audit mode rejects a report whole and
  leaves the audit pending, but the reasons were dropped, so `maxIterations` bought re-rolls rather
  than informed retries.
- The audit justification gate accepts the phrasings agents actually write. It required three
  lexical whitelists to all match and rejected 37% of a 367-string corpus, three quarters of that on
  the inspection verb alone. It now requires one named scope plus two independent corroborating
  signals, which takes corpus acceptance from 63% to 92% with no loss against vacuous
  justifications. Citations accept dotfiles, line ranges, directory-qualified paths, and
  measurement evidence for findings that have no single line to point at, while a bare colon-number
  in prose can no longer pose as a citation.
- The mode prompts say what the runtime enforces. The claim that in-progress mode falls back to
  coding mode when no in-progress features exist is replaced by an explicit stop-with-a-no-work-
  report contract, "you have no time limit" is gone in favor of the enforced `--timeout`, and
  "after 3 failed attempts, skip to next feature" no longer tells agents to do the thing the result
  contract's scope guard rejects. The baseline-verified note describes the real commit order.
- Skills stop sending agents outside the workspace for metadata. About thirty sites across sixteen
  skills, the shared prompts, and the mode snapshots told agents to run aidd's own entry points from
  the aidd installation, which the native backend denies outright. Two `roadmap:apply` invocations
  are kept with the reason stated inline.
- The generic and Spernakit-specific skill workflows are separated.
- The Coordinator to Director rename is finished in the UI. Nothing named Coordinator was ever
  persisted, so there is no migration.
- `--audit-on-completion` and `--code-after-audit` are removed. Both were parsed and stored with no
  runtime consumers: the combination flipped the run into audit mode with no audit names and fell
  back to a blank audit definition. The parser rejects them loudly now instead of launching a no-op
  run.
- A blank directive fails argument validation instead of launching an agent whose prompt carries
  neither a task nor a permission wrapper. A skill that compiles to an empty directive is refused
  the same way.
- The project description and messaging were refreshed.
- The lint gate is split: `smoke:qc:fast` runs an ESLint-cached `lint:fast` while `smoke:qc` keeps
  running the uncached `lint`, since that cache keys on each file's own content and cannot see a
  type-aware violation created in one file by a change to another. `@typescript-eslint/unbound-method`
  is enforced for every TypeScript target rather than the frontend alone.

### Fixed

- Mixed-backend output no longer disappears from the console. A triumvirate recipe runs several
  backends into one transcript, but only the primary backend's parser was consulted and unclaimed
  lines fell through to a parser that yields nothing for a foreign envelope. Unclaimed lines walk
  every backend parser now, the ownership predicates were made shape-accurate so neither grok nor
  the OpenCode family can steal the other's `{"type":"text"}`, and cline joins the chain with its
  result withheld until finalize.
- Token counts in the console are the run's real totals. claude-code repeats its message-level usage
  per content block as a mid-stream snapshot while the metrics pass summed every usage event, which
  is how a full run reported "tokens: 2 in, 2 out".
- Cline's tool calls are visible. Every text delta re-sends the whole message so far, so one
  document review logged 5.4 MB of which about 95% was re-sends, pushing the run's actual tool calls
  out of both the server tail cap and the render window.
- The console measures its transcript window in bytes rather than UTF-16 code units, so a large
  non-ASCII transcript no longer warns about hidden output that is entirely present. A backend's
  known streaming limit is stated up front, so grok's empty tool section reads as its CLI emitting
  no tool events rather than as aidd dropping them.
- The console fills the viewport at 2xl instead of scrolling inside a fixed 520px box on a wide
  monitor, and a pinned console re-pins after a window resize, a sidebar collapse, or the terminal
  pane opening.
- Command titles from codex are read back the way a shell would read them, so Windows runs no longer
  show every command behind a doubled program path. The detail panel's stop detail collapses an
  `AIDD_RESULT` payload to a placeholder rather than printing an entire audit report as one JSON
  string.
- The native run log round-trips its own grammar. Model prose beginning `$ `, `→ `, or `[error]` was
  written verbatim and read back as evidence aidd never observed, so an explanation starting
  `$ rm -rf build` became a command in the run's audit trail.
- openai gets the native prompt fragment. It runs through the native backend like ollama and lmstudio
  but was missing from the native-fragment set, so its prompts shipped without the tool-use preamble
  and the missing file error was swallowed.
- Audit findings are validated before they are persisted. An empty-object finding became a
  fabricated backlog feature whose spec claimed it was verified, and a null entry crashed the CLI
  after the agent run, mid-batch, leaving partial state. A report containing any invalid entry is
  rejected whole and re-queued. The empty-report warning also fired only when two or more audits all
  returned zero findings, so a single-audit run was never checked and one real finding immunized a
  whole batch.
- The compiled audit prompt no longer contradicts itself about writing `.aidd/CHANGELOG.md`.
  Guardrails are mode-aware, and an audit reports its blocker in the response rather than being told
  to record it in a file the same prompt forbids it to touch.
- Saving Settings no longer deletes hand-written backend keys. Each backend entry was rebuilt from
  only its four managed fields, so a valid schema key the resolver honors was discarded the first
  time anyone pressed Save, with no warning. Clearing a field removes the key rather than persisting
  0, since 0 is a real ceiling that would warn on every run.
- The kilocode and opencode model placeholders show the `provider/model` shape both CLIs require.
- `smoke:qc` invalidates the frontend build when shared sources change. The frontend compiles the
  shared console parsers into its bundle, so editing one left the build cached while everything else
  re-ran, and the gate went green over a `dist/` that still served the pre-edit rendering.
- A run whose log outlived its process can recover its result. A bounded log tail is read before
  stale terminalization, late ledger evidence wins, and the run shows the shared amber outcome
  instead of a failed row.
- The screenshot push guard tells an opted-out repository from a forgotten capture. A missing
  `screenshots/` directory means the repository does not capture at all and the push passes; a
  directory that exists with no capture for the tag still fails. Scaffolding ships the corrected
  guard.
- The license inventory finds packages nested under a scope directory. `@octokit/` holds packages
  rather than being one, so a nested copy under a scoped package was unreachable and a hoisted
  install that kept a second version there reported the package as not installed at all.

### Security

- Persisted iteration artifacts are scrubbed. Live console text was already scrubbed on its way out,
  but the iteration transcript is written from the accumulated record and kept whatever an agent had
  read out of a `.env` verbatim; an audit found a still-valid credential sitting in a project's
  iteration logs. `writeIteration` scrubs the transcript and walks the structured sidecar, the log
  cleaner scrubs alongside its ANSI strip and sweeps `.json` sidecars, and the `.cleaned` marker
  carries a cleaner version so a rule change forces one full re-sweep instead of skipping every log
  older than the new pass. Prefix rules are anchored on a word boundary, which removed about 1200
  false positives across archived logs. A sweep rewrote 3876 of 6805 existing artifacts across 24
  projects. Redaction closes the on-disk copy only; an exposed credential still has to be rotated at
  the provider.
- Repository content quoted into a prompt cannot break out of its fence. Changelog and prior-report
  excerpts are agent-authored text and were interpolated into a fixed three-backtick fence or a
  two-space indent, neither of which contains them. Both use a negotiated fence that always exceeds
  the longest inner backtick run, and a shared Untrusted Content Boundary section tells every
  backend that quoted project data is never instructions.
- The sandbox denies `cd` escapes. `cd "$AIDD_ROOT"` read to the lexical path filter as a relative
  segment, resolved happily inside the workspace, and was then expanded by bash to wherever the
  variable pointed, after which every downstream path check was relative to the directory `cd` had
  chosen. Any unquoted `cd` or `pushd` destination containing `$` or a backtick is denied. Denials
  also say what they are: one run spent 24 minutes and a flailing exit cycling path spellings
  because a policy denial read as an ordinary command failure, so every denial now carries a trailer
  saying the policy is a property of the runtime and that a task which cannot be done inside the
  workspace is a reportable outcome. The native run log renders a `[denied]` line for the violation.
