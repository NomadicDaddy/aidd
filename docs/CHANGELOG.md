# Changelog

All notable public aidd releases are documented here.

## [2.135.0] - 2026-07-28

### Added

- Added a Milestones tab to project detail for creating, renaming, reordering, describing, and
  deleting a project's roadmap milestones, plus an auto-place action for features that have no
  milestone. Each operation shows what it will do before it runs, and anything that moves features
  is refused while the project has an active run.
- Agent launch prompts now state whether `.aidd` is tracked by git in the target repository, so an
  agent stops re-deriving that from history commands which cannot answer there.

### Changed

- Milestone auto-placement pushes dependents later instead of pulling a dependency forward into the
  milestone the coding gate is currently working from, leaves dependency cycles in place and
  reports them, and names cross-milestone dependency violations that previously ended a run with
  "all candidates dependency-blocked" and no cause.
- Execution-identity badges use one quiet neutral capsule instead of per-value colors, carry a CLI
  icon on the backend segment, and the Settings badge lab now previews representative identities
  rather than every combination.
- Roadmap application distinguishes a roadmap entry that omits dependencies from one that replaces
  them: an omitted key preserves the feature's existing dependencies, an explicit empty array
  clears them, and the summary reports how many lists were written and how many were preserved.
- The bundled Dance skill explains that the Spernakit manifest mirrors ports and versions rather
  than owning them, and the Spernakit bump and template-upgrade workflows sync the fleet manifest
  during a release.
- Agent testing guidance now carries a browser-eval recipe that works on both bash and PowerShell.

### Fixed

- Fixed the Runs page crashing when an execution identity was clipped; the truncation measurement
  fed back on itself through the tooltip wrapper until the render-depth limit was reached.
- Restored pointer selection on execution rows and cards, with keyboard selection still on the
  labeled console button.
- Stopped the Runs left column shifting when the Live Console grew, so the run history card no
  longer drifts down while a live run streams output.
- Project reports and roadmap summaries now name the same current milestone the coding gate admits
  work from, instead of depending on milestone names happening to sort into priority order.
- Feature writes go back to the directory the record was read from, so a project whose feature IDs
  and directory names differ no longer grows a duplicate feature directory on every write.
- An iteration that lands commits but whose backend reports no file changes now derives its file
  evidence from those commits, so run history no longer shows nothing for work that plainly touched
  the tree.
- An unreadable feature record is reported and carried into the next iteration with repair
  instructions, instead of silently vanishing from the feature listing and then scoring the repair
  as out-of-scope work.
- A first out-of-scope completion steers the next iteration with a corrective note; only a second,
  distinct overrun ends the run.
- Release screenshot capture is judged by the crawl's own recorded verdict rather than by counting
  image files, and a request the page itself cancels no longer counts as a network failure.

### Baseline capabilities

- Directs AI-assisted development from project discovery and blueprint creation through feature
  execution, review, audit, testing, and release preparation.
- Provides CLI and local web-control-panel workflows backed by a shared orchestration, metadata,
  configuration, and run-history implementation.
- Supports native and external agent backends with explicit approval gates, bounded execution,
  worktree isolation, cross-worktree feature leases, conflict parking, resumable runs, and
  persisted iteration evidence.
- Ships maintained catalogs of audits, skills, prompts, recipes, and project scaffolding with
  feature, roadmap, assertion, screen-map, and testing-scenario contracts.
- Creates a usable roadmap when a project has features but no roadmap, while preserving dependency
  order and milestone assignments.
- Manages a project's milestones directly, including dependency-aware placement of unassigned
  features and a preview of every change before it is applied.
- Presents direct runs and recipe pipelines in one execution feed with nested step status, deep
  links, filters, and live output.
- Shows project maturity and deployment evidence in the artifact inventory and opens readable
  single-file artifacts in the bounded viewer.
- Includes repository hygiene, dependency, security, licensing, architecture, accessibility,
  performance, and deployment checks suitable for both interactive use and CI.
- Builds self-contained CLI and web binaries with their frontend and catalog assets, exact source
  manifests, checksums, license notices, and corresponding-source records.
- Includes provenance-aware UI playground skills for synchronizing designer fixtures and reviewing
  changes before they return to an application.

### Release integrity

- Release packaging copies only Git-tracked catalog and documentation assets and cleans the output
  directory before staging a candidate.
- Distributed material is classified in `licenses/distributed-materials.json`; registry paths,
  packager surfaces, attribution notices, and archive contents are validated together.
- Release validation requires the exact current-version archive and stage names, exact catalog
  parity, current source revision metadata, and the complete runtime and third-party notice set.
- Crawltest archives screenshots under the release version, and pre-push hooks reject new version
  tags that do not have a complete screenshot set.
- CI builds and probes the Git-independent Linux release image after quality checks, including
  notice, package-inventory, and excluded-agent checks.
- The fresh-release gate prevents public baseline content from acquiring pre-baseline aidd release
  records, changelog entries, artifact names, or repository-history narratives.
