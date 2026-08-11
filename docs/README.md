# aidd Documentation

These docs describe the standalone aidd runtime and its bundled local web control panel. New
to aidd? Start with the [Quickstart](./guides/quickstart.md). For terminology, the canonical
glossary is the repository-root [CONTEXT.md](../CONTEXT.md).

Docs are organized by audience:

- **Guides**: task-oriented, for operators using aidd.
- **Reference**: schemas and contracts to look up.
- **Architecture**: how the runtime works, for contributors.

## Guides

| Document                                                | Purpose                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [quickstart.md](./guides/quickstart.md)                 | Install, launch the web panel, add a project, run a first workflow.               |
| [configuration.md](./guides/configuration.md)           | User and project config files, merge order, accepted keys, examples.              |
| [what-aidd-modifies.md](./guides/what-aidd-modifies.md) | Trust reference: everything aidd reads, writes, runs, and sends over the network. |
| [backends.md](./guides/backends.md)                     | Backend adapter contract and supported CLI/provider surfaces.                     |
| [deployment.md](./guides/deployment.md)                 | Standalone build layout, launch, config/log/data, remote binding, rollback.       |
| [releasing.md](./guides/releasing.md)                   | Maintainer release checklist and rollback plan for the tag-driven release flow.   |
| [docker.md](./guides/docker.md)                         | Docker image, compose deployment, volumes, agent auth, upgrade/rollback.          |
| [recipes.md](./guides/recipes.md)                       | Bundled file-backed recipes generated from `recipes/*.json`.                      |
| [skills.md](./guides/skills.md)                         | Agent Skills format, categories, managed imports, support files, one-shots.       |
| [coderabbit.md](./guides/coderabbit.md)                 | CodeRabbit integration: local CLI reviews and the GitHub App PR remediation loop. |
| [audits.md](./guides/audits.md)                         | Audit mode usage, outputs, finding contracts, and follow-up flow.                 |
| [director.md](./guides/director.md)                     | Fleet Director: profile, cycles, suggestions, and the chat agent.                 |
| [interview.md](./guides/interview.md)                   | Interview mode: gathering project context via questions and answers.              |
| [telemetry.md](./guides/telemetry.md)                   | Local invocation telemetry and the usage dashboard.                               |
| [triumvirate.md](./guides/triumvirate.md)               | Triumvirate planning, overseer, execution, and artifacts.                         |
| [auto-rebuild.md](./guides/auto-rebuild.md)             | Rebuild workflow for project specs, feature backlogs, audits, and validation.     |

## Reference

| Document                                                                               | Purpose                                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [feature-fields.md](./reference/feature-fields.md)                                     | Feature JSON fields, IDs, statuses, roadmap mapping, audit metadata.        |
| [sample-feature-full.json](./reference/sample-feature-full.json)                       | Full valid feature JSON example.                                            |
| [project-profile.md](./reference/project-profile.md)                                   | `.aidd/project-profile.json` schema, fields, and inference behavior.        |
| [audit-applicability.md](./reference/audit-applicability.md)                           | Global and per-project audit applicability mapping and `/audits` matrix UI. |
| [artifacts.md](./reference/artifacts.md)                                               | How each `.aidd/` artifact is created or refreshed.                         |
| [external-skills.md](./reference/external-skills.md)                                   | Optional upstream skills aidd can use, and the distribution boundary.       |
| [execution-flow.md](./reference/execution-flow.md)                                     | Execution flow from CLI args through iteration artifacts.                   |
| [gate-conventions.md](./reference/gate-conventions.md)                                 | The eight rules every `check*` gate follows, and how to change one.         |
| [project-reports.md](./reference/project-reports.md)                                   | Web bug/feature reports and the feature records they generate.              |
| [dashboard-data-refresh.md](./reference/dashboard-data-refresh.md)                     | Dashboard elements, their API endpoints, query keys, and refresh behavior.  |
| [dashboard-metrics.md](./reference/dashboard-metrics.md)                               | Definition of record for the four dashboard fleet-metric numbers.           |
| [projects-page-data-refresh.md](./reference/projects-page-data-refresh.md)             | Projects list page data sources, query keys, and refresh behavior.          |
| [project-detail-page-data-refresh.md](./reference/project-detail-page-data-refresh.md) | Project detail page data sources, query keys, and refresh behavior.         |

## Architecture

| Document                                                          | Purpose                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [overview.md](./architecture/overview.md)                         | Runtime module boundaries and web control panel architecture.                                         |
| [project-lifecycle.md](./architecture/project-lifecycle.md)       | End-to-end project lifecycle: creation/intake → phases → orchestration → audit → maturity → pipeline. |
| [compatibility.md](./architecture/compatibility.md)               | Stable public runtime surfaces, breaking changes, and gates.                                          |
| [prompt-compiler.md](./architecture/prompt-compiler.md)           | Prompt compiler inputs, assembly order, and snapshot keys.                                            |
| [prompt-selection.md](./architecture/prompt-selection.md)         | How modes, filters, roles, and backends shape prompts.                                                |
| [parallel-multi-audit.md](./architecture/parallel-multi-audit.md) | Batched audit behavior and result contract.                                                           |
| [benchmark-harness.md](./architecture/benchmark-harness.md)       | CLI-only benchmark runner, fixtures, outputs, and commands.                                           |
| [websocket-events.md](./architecture/websocket-events.md)         | WebSocket event contract: events, triggers, payloads, and frontend query invalidations.               |

### Architecture decisions (ADRs)

| ADR                                                                          | Decision                         |
| ---------------------------------------------------------------------------- | -------------------------------- |
| [0001-single-user-control-panel.md](./adr/0001-single-user-control-panel.md) | Single-user local control panel. |

## Changelog

The public release changelog is [CHANGELOG.md](./CHANGELOG.md) (Keep a Changelog format).

## Validation

Before committing docs or metadata changes in aidd:

```powershell
bun run start -- --project-dir . --check-features
bun run start -- --project-dir . --check-artifacts
bun run smoke:qc
```
