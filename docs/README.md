# aidd Documentation

These docs describe the aidd runtime and its bundled local web control panel. New
to aidd? Start with the [Quickstart](./quickstart.md). For terminology, the canonical
glossary is the repository-root [CONTEXT.md](../CONTEXT.md).

Docs are organized by audience:

- **Reference**: the operator-facing surface — configuration, backends, deployment, and the
  schemas and contracts you look things up in.
- **Architecture**: how the runtime works, for contributors.

Task-oriented walkthroughs of the panel's own pages — Dashboard, Projects, Runs, Director, Audits,
Skills, Scheduled, Telemetry, Recipes, Pipelines, Settings — ship inside the panel and are read
there, on the Docs page. Their source is `frontend/content/docs/`.

## Reference

| Document                                                         | Purpose                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [configuration.md](./reference/configuration.md)                 | User and project config files, merge order, accepted keys, examples.                  |
| [what-aidd-modifies.md](./reference/what-aidd-modifies.md)       | Trust reference: everything aidd reads, writes, runs, and sends over the network.     |
| [backends.md](./reference/backends.md)                           | Backend adapter contract and supported CLI/provider surfaces.                         |
| [deployment.md](./reference/deployment.md)                       | Install, launch, config/log/data locations, remote binding, update, uninstall.        |
| [licensing.md](./reference/licensing.md)                         | Fair Source terms and the capabilities included with aidd.                            |
| [recipes.md](./reference/recipes.md)                             | Bundled file-backed recipes defined in `recipes/*.json`.                              |
| [coderabbit.md](./reference/coderabbit.md)                       | CodeRabbit integration: the local CLI review skill, prerequisites, and recipe wiring. |
| [interview.md](./reference/interview.md)                         | Interview mode: gathering project context via questions and answers.                  |
| [triumvirate.md](./reference/triumvirate.md)                     | Triumvirate planning, overseer, execution, and artifacts.                             |
| [auto-rebuild.md](./reference/auto-rebuild.md)                   | Rebuild workflow for project specs, feature backlogs, audits, and validation.         |
| [feature-fields.md](./reference/feature-fields.md)               | Feature JSON fields, IDs, statuses, roadmap mapping, audit metadata.                  |
| [sample-feature-full.json](./reference/sample-feature-full.json) | Full valid feature JSON example.                                                      |
| [project-profile.md](./reference/project-profile.md)             | `.aidd/project-profile.json` schema, fields, and inference behavior.                  |
| [audit-applicability.md](./reference/audit-applicability.md)     | Global and per-project audit applicability mapping and `/audits` matrix UI.           |
| [artifacts.md](./reference/artifacts.md)                         | How each `.aidd/` artifact is created or refreshed.                                   |
| [external-skills.md](./reference/external-skills.md)             | Optional upstream skills aidd can use, and the distribution boundary.                 |
| [execution-flow.md](./reference/execution-flow.md)               | Execution flow from CLI args through iteration artifacts.                             |
| [gate-conventions.md](./reference/gate-conventions.md)           | The eight rules every `check*` gate follows, and how to change one.                   |
| [project-reports.md](./reference/project-reports.md)             | Web bug/feature reports and the feature records they generate.                        |
| [dashboard-metrics.md](./reference/dashboard-metrics.md)         | Definition of record for the four dashboard fleet-metric numbers.                     |
| [data-refresh.md](./reference/data-refresh.md)                   | How the panel keeps data current: defaults, invalidation, polling, reconnect.         |

## Architecture

| Document                                                          | Purpose                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [overview.md](./architecture/overview.md)                         | Runtime module boundaries, web control panel architecture, and the single-operator scope boundary.    |
| [version-comparison.md](./architecture/version-comparison.md)     | Feature and polish progression across the v1, v2, and v3 product generations.                         |
| [project-lifecycle.md](./architecture/project-lifecycle.md)       | End-to-end project lifecycle: creation/intake → phases → orchestration → audit → maturity → pipeline. |
| [compatibility.md](./architecture/compatibility.md)               | Stable public runtime surfaces, configuration contract, and gates.                                    |
| [prompt-compiler.md](./architecture/prompt-compiler.md)           | Prompt compiler inputs, assembly order, and snapshot keys.                                            |
| [prompt-selection.md](./architecture/prompt-selection.md)         | How modes, filters, roles, and backends shape prompts.                                                |
| [parallel-multi-audit.md](./architecture/parallel-multi-audit.md) | Batched audit behavior and result contract.                                                           |
| [benchmark-harness.md](./architecture/benchmark-harness.md)       | CLI-only benchmark runner, fixtures, outputs, and commands.                                           |
| [audit-evals.md](./architecture/audit-evals.md)                   | Planted-defect audit scoring, precision/recall floors, and attestation gate.                          |
| [websocket-events.md](./architecture/websocket-events.md)         | WebSocket event contract: events, triggers, payloads, and frontend query invalidations.               |
| [releasing.md](./architecture/releasing.md)                       | Maintainer release checklist and rollback plan for the tag-driven release flow.                       |

## Changelog

The public release changelog is [CHANGELOG.md](./CHANGELOG.md) (Keep a Changelog format).

## Validation

Before committing docs or metadata changes in aidd:

```powershell
bun run start -- --project-dir . --check-features
bun run start -- --project-dir . --check-artifacts
bun run smoke:qc
```
