## aidd v2 Artifact Creation/Refreshing

Skills are the aidd-local directive catalog. Each lives at
`skills/<id>/SKILL.md` with optional support files. Recipes invoke them with
`stepType: "skill"`. Recipe `aidd-cli` steps inherit the selected launch target
unless a custom recipe explicitly sets an execution override.

`aidd --project-dir <app> --check-artifacts` writes `.aidd/.artifacts-check.json` from the
project assertion catalog (`collectArtifactStatuses` in `shared/src/metadata/store/artifacts.ts`).
Only the `required`/`recommended`/`optional` rows below are part of that catalog; those are the
only valid `ArtifactSeverity` values. The remaining rows document related `.aidd/` artifacts and
how they are refreshed, but they are not checked by `--check-artifacts`.

## The artifact catalog and the ignore file

**This table is the complete catalog: every `.aidd/` path aidd recognizes has exactly one row.**
That is broader than "paths aidd writes" — `aidd.config.json` is only ever read by aidd (the
matching writer targets the user config), and `roadmap.md` is hand-authored. If aidd
starts recognizing a new path, it
gets a row here first. `scaffolding/.gitignore` is then a _derived_ file — the mechanical
projection of the non-committed classes — not an independently maintained list.

`bun run check:artifact-parity` enforces the invariant below. Note what it cannot do: it compares
this table to the ignore file, so it cannot prove the table lists every path aidd touches. A path
handled in code but absent from both files is invisible to it. Adding the row remains a manual step
when adding a writer or reader.

The two files are therefore not literal mirrors, and should not be. A `tracked` artifact belongs
in this catalog and must be **absent** from the ignore file; that absence is what commits it.
Parity means _every artifact has a row_, and _the ignore file contains exactly the rows whose class
is not committed_ — nothing more, nothing less.

Each class states the artifact's **Git disposition**:

| Class                               | Committed? | Ignore rule | Meaning                                                                                        |
| ----------------------------------- | ---------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `required`/`recommended`/`optional` | yes        | must not    | Durable blueprint, and checked by `--check-artifacts`.                                         |
| `tracked`                           | yes        | must not    | Durable blueprint, not part of the assertion catalog.                                          |
| `runtime`                           | no         | must        | Meaningful only for the run that wrote it.                                                     |
| `generated`                         | no         | must        | Reproducible by re-running its producer.                                                       |
| `secret`                            | no         | must        | Confidential. Ignored because publishing it leaks credentials, not because it is reproducible. |

Committed artifacts are committed **in managed applications only**. An application with its own
push remote ignores `.aidd/` wholesale, because publishing the blueprint is worse than losing the
co-versioning it buys.

Prompts must therefore treat this table as a default disposition, not permission to override the
target repository. They update required metadata on disk in both profiles, commit it only when Git
already tracks it, and never force-add a path matched by the target's ignore rules. A completion
marker may follow an ignored-metadata-only update when no source changes remain uncommitted.

`secret` is deliberately distinct from `generated`: a lost `generated` file can be regenerated,
whereas the harm from a committed `secret` is disclosure and is not undone by deleting the file
afterward. Never reclassify a `secret` row to make it committable.

**The invariant:** a committed row must have no matching rule in `scaffolding/.gitignore`; a
`runtime`/`generated`/`secret` row must have exactly one. A rule with no row, or a row
with no rule, is drift — both have happened, and both went unnoticed for months.

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

| Artifact                             | Severity    | Refresh Process                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONTEXT.md`                         | required    | Maturity shows a manual hint to run the external `grill-with-docs` skill from the canonical AI catalog (`<applications-root>/ai/skills/grill-with-docs`)                                                                                         |
| `.aidd/spec.md`                      | required    | `skill:review-or-create-doc {app}/.aidd/spec.md`                                                                                                                                                                                                 |
| `.aidd/assertions.md`                | recommended | `skill:review-or-create-doc {app}/.aidd/assertions.md`                                                                                                                                                                                           |
| `.aidd/project-structure.md`         | recommended | `skill:review-or-create-doc {app}/.aidd/project-structure.md`                                                                                                                                                                                    |
| `.aidd/project.md`                   | recommended | manual edits only; project-local overrides and goals                                                                                                                                                                                             |
| `.aidd/roadmap.json`                 | recommended | `skill:update-roadmap {app}`, then `bun run aidd-tools -- roadmap:apply --project-dir {app}`                                                                                                                                                     |
| `.aidd/roadmap.md`                   | tracked     | manual edits only; human-readable companion to `roadmap.json`, which is the machine source of truth. No skill writes it                                                                                                                          |
| `.aidd/project-profile.json`         | recommended | Maturity profile action infers and writes the profile; the control panel can then apply explicit assurance-profile edits                                                                                                                         |
| `.aidd/screen-map.md`                | recommended | `skill:update-screen-map {app}`                                                                                                                                                                                                                  |
| `.aidd/testing-scenarios.md`         | recommended | `skill:testing-scenarios {app}`                                                                                                                                                                                                                  |
| `.aidd/questions.md`                 | optional    | `skill:onboarding-interview {app}`                                                                                                                                                                                                               |
| `.aidd/responses.md`                 | optional    | `aidd --interview` response index                                                                                                                                                                                                                |
| `.aidd/responses/`                   | optional    | `aidd --interview` response files                                                                                                                                                                                                                |
| `.aidd/features/*/feature.json`      | tracked     | Maturity opens the feature-creation flow; `skill:feature-review`, `skill:bug2feature`, and `skill:doc2feature` review or create records in their specialized workflows                                                                           |
| `.aidd/deployment.md`                | tracked     | `skill:deployment-readiness {app}` (maturity `shipped` stage)                                                                                                                                                                                    |
| `.aidd/CHANGELOG.md`                 | tracked     | `skill:document-changes {app}`; coding sessions may also append entries                                                                                                                                                                          |
| `.aidd/todo.md`                      | tracked     | `--todo` mode (`cli/src/modes/todo.ts`); absence is not an error                                                                                                                                                                                 |
| `.aidd/notes.md`                     | tracked     | Free-form scratch pad, edited from the control panel; never machine-written                                                                                                                                                                      |
| `.aidd/diary/`                       | tracked     | written by `skill:diary-entry`; one file per calendar day at `YYYY/MM/DD.md`, idempotent                                                                                                                                                         |
| `.aidd/maturity.json`                | tracked     | Maturity "Mark N/A" skip list (`MATURITY_SKIP_FILE`)                                                                                                                                                                                             |
| `.aidd/audit-profile-overrides.json` | tracked     | Per-project audit ↔ profile overrides; schema-validated                                                                                                                                                                                          |
| `.aidd/response-review.md`           | generated   | `interview` recipe; assessment of raw interview responses. Read back by `skill:doc2feature`                                                                                                                                                      |
| `.aidd/remediation-review.md`        | generated   | `interview` recipe; assessment of remediation features. Read back by `skill:feature-review`                                                                                                                                                      |
| `.aidd/feature-review-report.md`     | generated   | Written by `skill:feature-review` sessions; a report, not a blueprint                                                                                                                                                                            |
| `.aidd/audit-reports/*.md`           | generated   | Maturity launches the selected profile-applicable audit; audit runs persist reports through `writeAuditReport`                                                                                                                                   |
| `.aidd/reports/*.md`                 | generated   | skills and recipes that create session or sweep reports                                                                                                                                                                                          |
| `.aidd/_common/`                     | generated   | Shared modules copied in from aidd (`copyCommonModules`)                                                                                                                                                                                         |
| `.aidd/audits/`                      | generated   | Audit definitions copied in from the fleet catalog at `aidd/audits/`                                                                                                                                                                             |
| `.aidd/skills/`                      | generated   | Skill contracts and support files copied in from aidd when a skill is invoked (`copySkillContracts`)                                                                                                                                             |
| `.aidd/.artifacts-check.json`        | generated   | `aidd --project-dir <app> --check-artifacts`                                                                                                                                                                                                     |
| `.aidd/runs.jsonl`                   | runtime     | aidd orchestrator run ledger, including the aidd version, Git revision, and dirty state captured when each run starts; older entries are read as `null` provenance and are not backfilled                                                        |
| `.aidd/iterations/`                  | runtime     | aidd iteration extraction (`*.json`) and raw run logs (`*.log`)                                                                                                                                                                                  |
| `.aidd/active-runs/`                 | runtime     | In-flight run state, including the run-start aidd version, Git revision, and dirty state                                                                                                                                                         |
| `.aidd/.stop`                        | runtime     | The stop signal. `stopRun`/`requestCliRunStop` write it; the CLI honors it                                                                                                                                                                       |
| `.aidd/aidd.config.json`             | secret      | Hand-authored project override, read-only to aidd (`readConfig`, `services/run/launchConfig.ts`). May hold provider API keys, `web.authToken`, `botToken`. The `0o600` writer in `settingsService.ts` targets the **user** config, not this file |

Related non-aidd artifacts:

| Artifact                                         | Refresh Process                                           |
| ------------------------------------------------ | --------------------------------------------------------- |
| `docs/**`                                        | `skill:document-changes {app}`                            |
| Deploy config (`Dockerfile`, `wrangler.toml`, …) | `skill:deployment-readiness {app}` (fills gaps only)      |
| Release tags (`.git/refs/tags`)                  | `git tag` by the owner, or the `deploy` recipe on success |
