# aidd v1, v2, and v3

This compares the three aidd product generations. It is not a file-by-file comparison of three
preserved releases. The v1 label describes the original architecture, whose own package versions
were still 0.x. The v2 repository was recreated at v2.131.0, so its earlier Git history and the v1
history are not reachable from the current branch.

The historical boundary comes from the development diary and cutover records: the unified v1
orchestrator began in January 2026, v2 became the operational target in May, and v2.142.0 is the
last documented state before the major-version change. The v3 column describes the 3.0.0
public release from September 7, 2026, including the September 5 release-preparation fixes.
Later maintenance releases are recorded in the [changelog](../CHANGELOG.md).

## Comparison

| Area                     | v1                                                                                                                | v2 through 2.142.0                                                                                                                                                           | v3 3.0.0                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main job                 | Run coding agents repeatedly against a structured feature queue.                                                  | Operate AI coding work across projects from one local platform.                                                                                                              | Run that platform safely with more work delegated to aidd itself.                                                                                                                                                    |
| Architecture             | Bash-centered orchestration assembled from separate provider wrappers and parsers.                                | Bun and TypeScript rewrite with shared contracts, a database-backed web backend, and an integrated React panel.                                                              | The v2 architecture with tighter admission, identity, recovery, install, and release contracts.                                                                                                                      |
| Backends                 | Claude Code first, followed by OpenCode, KiloCode, and ZRun/GLM adapters.                                         | Ten local, hosted, and CLI choices, including the native OpenAI-compatible backend, Ollama, LM Studio, Cline, codex, grok, kilocode, and opencode.                           | The same broad backend surface, resolved through one launch path with provider-specific key isolation.                                                                                                               |
| Work selection           | `feature.json` records, audit findings, milestone and feature filters, and retry or stuck detection.              | Features, audits, directives, one-shot skills, recipes, nested pipelines, project profiles, and Triumvirate planning.                                                        | Ranked Director suggestions can launch bounded work automatically, while unsupported or risky work stays pending for an operator.                                                                                    |
| Operator experience      | CLI-first. A separate aidd-web companion exposed project and run information but was not the orchestration core.  | Dashboard, Projects, Runs, Director, Pipelines, Scheduled Tasks, Audits, Skills, Recipes, Telemetry, Diary, Settings, docs, and a persistent terminal.                       | The same workspaces with more consistent state, clearer provenance, deferred global UI, and fewer cases where the screen guesses what happened.                                                                      |
| Fleet operation          | Parallel project runs proved the throughput model, but coordination lived mostly in commands, logs, and metadata. | Project discovery, fleet summaries, Director cycles, schedules, recipes, remote launch, and unified run history.                                                             | Director auto-launch adds rank, risk, recipe allow-list, per-cycle, dirty-tree, busy-project, and one-per-project bounds, with recorded reasons for every launch or skip.                                            |
| Evidence                 | Feature records, validation, full iteration transcripts, elapsed time, and audit output under `.aidd/`.           | Structured iteration, run, pipeline, audit, telemetry, and outcome records, plus content hashes for the skill, audit, recipe, or directive that drove a run.                 | Run initiator is recorded at launch as Operator or Automatic, suggestion rank survives persistence, and recovery paths preserve or finalize evidence after crashes and races.                                        |
| Audits                   | More than 20 named audit categories and a finding-to-remediation loop.                                            | Profile-selected audits, finding verification and deduplication, stable artifacts, planted-defect evaluation, and backlog integration.                                       | Stable finding fingerprints, an append-only lifecycle ledger, recurrence and outcome accounting, WATERMARK coverage, and stricter recovery of emitted reports.                                                       |
| Concurrency and recovery | Idle nudges, retry limits, consecutive-failure stops, and stuck detection.                                        | Worktree isolation, feature leases, run reconciliation, resumable pipelines, and configured concurrency ceilings.                                                            | Mutating runs reserve the checkout before spawn, live feature records survive deletion races, process-tree teardown protects the owner, and automatic Director decisions resume once after restart.                  |
| Remote control           | Local command wrappers.                                                                                           | MCP and Telegram can inspect the fleet and launch supervised work through the web backend.                                                                                   | Remote entry points retain their operator provenance; unattended work remains separately identifiable and bounded.                                                                                                   |
| Quality and release      | Runtime-oriented checks proved the loop against real applications.                                                | `smoke:qc`, focused tests, crawl reports, screenshot gates, audit evaluation, release checks, and cached validation grew into a full release system.                         | Fresh source installs build themselves, reports carry build identity, bundle analysis rejects stale evidence, hosted CI audits dependencies, and the release is source-only.                                         |
| UI polish                | Useful and information-dense, with most feedback delivered through terminal output and metadata.                  | Responsive navigation, URL-backed filters, sortable tables, consistent page rails, accessible controls, Markdown rendering, overflow treatment, and compact desktop layouts. | First paint drops from about 226 KB to 162 KB gzip, the dashboard uses a bounded summary payload, Web Vitals report p75, reconnect coverage is shared with live invalidation, and images reserve their layout space. |
| Distribution             | Internal local tooling assembled around the operator's workspace.                                                 | A packaged local platform, later simplified to source-only delivery.                                                                                                         | Released as a new public source baseline under FSL-1.1-ALv2, delivered as source only: no accounts, no prebuilt binaries, and no container image.                                                                    |

## What each generation added

v1 established the working loop: select a feature, compile instructions for the chosen agent, run
it, keep the transcript, decide whether the result counts, and continue without letting an idle or
failing agent run forever. It also made audits and structured `.aidd/features/*/feature.json`
records part of normal development. Its polish was mostly operational. Clear terminal state,
timeouts, retries, and durable metadata mattered more than a unified interface.

v2 replaced the shell-centered core with a typed runtime and folded the separate control-panel
work into the product. Recipes and pipeline sessions made workflows repeatable. Triumvirate added a
reviewed planning path. Project profiles changed audit selection by risk. Director, schedules,
telemetry, MCP, Telegram, worktrees, and leases moved aidd from one execution loop to a local fleet
operations platform.

The v2 line also carried most of the visible UI expansion. By 2.142.0, the panel had consistent
navigation and layout across its main workspaces, responsive desktop and mobile behavior, better
table and filter state, richer run consoles, accessible interactions, and release crawl coverage.
Calling all of that v3 polish would erase the work that happened during v2.

v3 adds less surface area than v2 did. Its main feature change is bounded Director suggestion
auto-launch. Most of the remaining work closes operational gaps exposed by the larger platform:
which actor started a run, how two launches contend for one checkout, what survives a restart,
whether a report measured the current build, how much code reaches first paint, and whether a fresh
source archive starts without undocumented build steps.

The 3.0.0 release also changes the product boundary. It presents aidd as
a new public source baseline and documents the license, install path, privacy boundary, supported
runtime, and release evidence as product contracts. Release screenshots now bind a successful full
crawl to the exact tagged source and production build; partial diagnostics cannot replace that
evidence. Desktop reading, phone editor actions, settings validation, credential changes, and
pipeline heading hierarchy received further corrections during release preparation. The documented
Windows native-shell boundary remains lexical, with an explicitly accepted interpreter escape risk.

## Reading the progression

- Choose v1 as the reference point for the core method: structured work, repeated agent runs,
  audits, transcripts, and stop conditions.
- Choose v2 as the reference point for feature breadth: the integrated panel, fleet workflows,
  planning modes, schedules, recipes, telemetry, and remote control.
- Choose v3 as the reference point for unattended operation and release polish: bounded autopilot,
  exact provenance, safer concurrency and recovery, measured frontend weight, and a reproducible
  source install.

The shortest fair description is that v1 proved the development loop, v2 assembled the operating
platform, and v3 adds bounded unattended operation and a public source release.
