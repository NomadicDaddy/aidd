## aidd Artifact Creation/Refreshing

Skills are the aidd-local directive catalog. Each lives at
`skills/<id>/SKILL.md` with optional support files. Recipes invoke them with
`stepType: "skill"`. Recipe `aidd-cli` steps inherit the selected launch target,
which wins over any backend, model, or reasoning effort pinned in the step's own config; the
step config applies only to the fields the launch selection leaves unset.

`bun run start -- --project-dir <app> --check-artifacts` writes `.aidd/.artifacts-check.json` from the
project assertion catalog (`collectArtifactStatuses` in `shared/src/metadata/store/artifacts.ts`).
Only the `required`/`recommended`/`optional` rows below are part of that catalog; those are the
only valid `ArtifactSeverity` values. The remaining rows document related `.aidd/` artifacts and
how they are refreshed, but they are not checked by `--check-artifacts`.

## The artifact catalog and the ignore file

**This table is the complete catalog: every `.aidd/` path aidd recognizes has exactly one row.**
That is broader than "paths aidd writes" — `aidd.config.json` is only ever read by aidd (the
matching writer targets the user config), and `roadmap.md` is hand-authored. If aidd starts
recognizing a new path, it gets a row here first.

**No `.aidd/` path is ever committed, in any repository** (Phillip, 2026-10-24, #21448). Project
metadata lives on disk only. aidd reads and writes it there and never needs it from Git: not for a
run, a fresh clone or CI. A repository that tracks any of it ends up with history to scrub, and the
blueprint sits beside generated reports, run state and secrets that must never be published.
`scaffolding/.gitignore` therefore ignores `/.aidd/` wholesale with one rule, and
`bun run check:artifact-parity` enforces exactly that: one wholesale rule, no per-path `.aidd/`
rules beside it, and a known class on every row. It cannot prove the table lists every path aidd
touches; adding the row remains a manual step when adding a writer or reader.
`bun run check:fleet-aidd-entries` checks the same rule in every repository on disk.

The class no longer decides Git disposition. It records what the artifact is:

| Class                               | Meaning                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `required`/`recommended`/`optional` | Durable blueprint, and checked by `--check-artifacts`.                                                          |
| `tracked`                           | Durable blueprint, not part of the assertion catalog.                                                           |
| `runtime`                           | Meaningful only for the run that wrote it.                                                                      |
| `generated`                         | Reproducible by re-running its producer.                                                                        |
| `secret`                            | Confidential operator configuration; credential-like values must not be published even when ignored at runtime. |

Prompts update required metadata on disk, never commit it, and never force-add a path the target's
ignore rules match. A completion marker may follow an ignored-metadata-only update when no source
changes remain uncommitted. A repository that still tracks `.aidd/` from before #21448 keeps its
files on disk when it stops tracking them (`git rm -r --cached .aidd`); its history still holds the
old commits until someone deliberately scrubs it, and the pre-push history guard refuses to publish
them.

`secret` stays a separate class from `generated`: a lost `generated` file can be regenerated,
whereas the harm from a disclosed `secret` is not undone by deleting the file afterward.

The check result records `phase`, `preOnboarding`, and `staleThresholdDays` (30) alongside the
per-artifact statuses. Missing **required** artifacts are informational until the project reaches
the `coding` phase (a fresh ingest has no `spec.md` yet because onboarding creates it later), so
the check only fails on missing required artifacts once `phase` is `coding`.

`MATURITY_INVOCATIONS` in `shared/src/metadata/maturity-invocations.ts` covers only artifacts in
the maturity ladder. For each covered artifact, the refresh process below starts with the same
skill, audit, feature-creation, profile, or manual action exposed by the maturity UI. Other catalog
rows document non-maturity producers and are intentionally absent from that invocation map.

`skill:refresh-project-artifacts {app}` is the umbrella maintenance workflow. It reads both tables
below at runtime, follows each documented process when its inputs exist, and records protected,
manual, or not-applicable outcomes where mutation would be unsafe or fabricated. Recipe
`reconcile-project-artifacts` invokes that skill and then runs `check-artifacts` as final validation.

| Artifact                             | Severity    | Refresh Process                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md`                         | required    | Follow the Context maintenance procedure in `docs/reference/external-skills.md`                                                                                                                                                                                                                                                         |
| `.aidd/spec.md`                      | required    | `skill:review-or-create-doc {app}/.aidd/spec.md`                                                                                                                                                                                                                                                                                        |
| `.aidd/assertions.md`                | recommended | `skill:review-or-create-doc {app}/.aidd/assertions.md`                                                                                                                                                                                                                                                                                  |
| `.aidd/project-structure.md`         | recommended | `skill:review-or-create-doc {app}/.aidd/project-structure.md`                                                                                                                                                                                                                                                                           |
| `.aidd/project.md`                   | recommended | manual edits only; project-local overrides and goals                                                                                                                                                                                                                                                                                    |
| `.aidd/roadmap.json`                 | recommended | `skill:update-roadmap {app}`; aidd writes resolved dependency IDs during run-end metadata reconciliation and leaves each feature's own `priority` untouched                                                                                                                                                                             |
| `.aidd/roadmap.md`                   | tracked     | manual edits only; human-readable companion to `roadmap.json`, which is the machine source of truth. No skill writes it                                                                                                                                                                                                                 |
| `.aidd/project-profile.json`         | recommended | Maturity profile action infers and writes the profile; the control panel can then apply explicit assurance-profile edits                                                                                                                                                                                                                |
| `.aidd/screen-map.md`                | recommended | `skill:update-screen-map {app}`                                                                                                                                                                                                                                                                                                         |
| `.aidd/testing-scenarios.md`         | recommended | `skill:testing-scenarios {app}`; seeds a missing catalog, augments an existing one by default, or rewrites only under explicit `--mode refresh`                                                                                                                                                                                         |
| `.aidd/questions.md`                 | optional    | `skill:onboarding-interview {app}`                                                                                                                                                                                                                                                                                                      |
| `.aidd/responses.md`                 | optional    | `--interview` mode response index                                                                                                                                                                                                                                                                                                       |
| `.aidd/responses/`                   | optional    | `--interview` mode response files                                                                                                                                                                                                                                                                                                       |
| `.aidd/features/*/feature.json`      | tracked     | Maturity opens the feature-creation flow; audits and the specialized `feature-coverage-audit`, `bug2feature`, `doc2feature`, `ui-redesign-planner`, and template-refactor workflows create records, while `feature-review` reconciles them                                                                                              |
| `.aidd/deployment.md`                | tracked     | `skill:deployment-readiness {app}` (maturity `shipped` stage)                                                                                                                                                                                                                                                                           |
| `.aidd/CHANGELOG.md`                 | tracked     | `skill:document-changes {app}`; coding sessions may also append entries                                                                                                                                                                                                                                                                 |
| `.aidd/todo.md`                      | tracked     | `--todo` mode (`cli/src/modes/todo.ts`); absence is not an error                                                                                                                                                                                                                                                                        |
| `.aidd/notes.md`                     | tracked     | Free-form scratch pad, edited from the control panel; never machine-written                                                                                                                                                                                                                                                             |
| `.aidd/diary/`                       | tracked     | written by `skill:diary-entry`; one file per calendar day at `YYYY/MM/DD.md`, idempotent                                                                                                                                                                                                                                                |
| `.aidd/maturity.json`                | tracked     | Maturity "Mark N/A" skip list (`MATURITY_SKIP_FILE`)                                                                                                                                                                                                                                                                                    |
| `.aidd/audit-profile-overrides.json` | tracked     | Per-project audit ↔ profile overrides; schema-validated                                                                                                                                                                                                                                                                                 |
| `.aidd/response-review.md`           | generated   | `interview` recipe; assessment of raw interview responses. Read back by `skill:doc2feature`                                                                                                                                                                                                                                             |
| `.aidd/remediation-review.md`        | generated   | `interview` recipe; assessment of remediation features. Read back by `skill:feature-review`                                                                                                                                                                                                                                             |
| `.aidd/feature-review-report.md`     | generated   | Written by `skill:feature-review` sessions; a report, not a blueprint                                                                                                                                                                                                                                                                   |
| `.aidd/audit-reports/*.md`           | generated   | Named, profile-applicable, and wrapper-driven audits run through audit mode; accepted reports persist through `writeAuditReport`                                                                                                                                                                                                        |
| `.aidd/reports/*.md`                 | generated   | skills and recipes that create session or sweep reports                                                                                                                                                                                                                                                                                 |
| `.aidd/screenshots/`                 | generated   | Skill-controlled browser screenshots and short video evidence, grouped by `{YYYYMMDD}{ID}`. Automated crawler and release archives remain under the repository-root `screenshots/` directory                                                                                                                                            |
| `.aidd/_common/`                     | generated   | Shared modules copied in from aidd (`copyCommonModules`)                                                                                                                                                                                                                                                                                |
| `.aidd/audits/`                      | generated   | Audit definitions copied in from the local fleet catalog at `audits/`                                                                                                                                                                                                                                                                   |
| `.aidd/skills/`                      | generated   | Skill contracts and support files copied in from aidd when a skill is invoked (`copySkillContracts`); `bun run start -- stage --project-dir <app> --skill <id>` stages them, and the skill's `.aidd/docs/` references, without a run                                                                                                    |
| `.aidd/docs/`                        | generated   | Root-relative files an invoked skill declares in `aidd-references` / `spernakit-references`, staged `<root>/<ref>` -> `.aidd/<ref>` by `copyReferenceFiles`. Every declared ref today lands here or under `.aidd/audits/`                                                                                                               |
| `.aidd/.artifacts-check.json`        | generated   | `bun run start -- --project-dir <app> --check-artifacts`                                                                                                                                                                                                                                                                                |
| `.aidd/findings-ledger.jsonl`        | runtime     | Append-only audit-finding lifecycle ledger; fingerprints join emitted, suppressed, recurred, dismissed, and remediated events even after feature deletion                                                                                                                                                                               |
| `.aidd/runs.jsonl`                   | runtime     | aidd orchestrator run ledger, including the aidd version, Git revision, and dirty state captured when each run starts; older entries are read as `null` provenance and are not backfilled                                                                                                                                               |
| `.aidd/iterations/`                  | runtime     | aidd iteration extraction (`*.json`) and raw run logs (`*.log`)                                                                                                                                                                                                                                                                         |
| `.aidd/active-runs/`                 | runtime     | In-flight run state, including the run-start aidd version, Git revision, and dirty state                                                                                                                                                                                                                                                |
| `.aidd/.stop`                        | runtime     | The stop signal. `stopRun`/`requestCliRunStop` write it; the CLI honors it                                                                                                                                                                                                                                                              |
| `.aidd/runtime/`                     | runtime     | Transient pipeline state the web panel writes: per-session metrics at `pipeline-sessions/<id>/metrics.json` (`sessionMetricsDump`), refreshed after each top-level step and swept at boot (`sessionMetricsSweep`)                                                                                                                       |
| `.aidd/tmp/`                         | runtime     | Audit scratch files an agent writes and removes within one run, such as the WATERMARK canary files; nothing reads them after the run                                                                                                                                                                                                    |
| `.aidd/aidd.config.json`             | secret      | Hand-authored project override, read-only to aidd (`readConfig`, `services/run/launchConfig.ts`). Provider definitions, credentials, channels, and listener access settings are ignored here; keep credentials in the environment, not this file. The `0o600` writer in `settingsService.ts` targets the **user** config, not this file |

Related non-aidd artifacts:

| Artifact                                         | Refresh Process                                           |
| ------------------------------------------------ | --------------------------------------------------------- |
| `docs/**`                                        | `skill:document-changes {app}`                            |
| Deploy config (`Dockerfile`, `wrangler.toml`, …) | `skill:deployment-readiness {app}` (fills gaps only)      |
| Release tags (`.git/refs/tags`)                  | `git tag` by the owner, or the `deploy` recipe on success |
