# Changelog

All notable public aidd releases are documented here.

## [2.134.0] - 2026-07-27

### Added

- Added a global directive launcher that starts a supervised review or apply-changes run for any
  discovered project from the sidebar, command palette, or keyboard.
- Added shared feature-dependency graph validation and ordering, dependency-blocked fleet counts,
  dependency context in coding prompts, and reverse dependents in Project feature details.
- Added a post-question interview recipe that resumes at response conversion after the interview
  and response review are already complete.
- Split the Runs workspace into Activity and Live Console panes while keeping direct runs and
  pipeline sessions in one filterable execution feed.

### Changed

- Pipeline sessions now show the backend, model, provider, and reasoning effort used by their steps,
  keep active step durations moving, and pass review findings into the remediation step that
  follows.
- Run orchestration now avoids starting an iteration that cannot fit the remaining wall-clock
  budget, carries forward verified baseline evidence, gives a corrective flailing retry without
  spending an iteration, and reports actionable backend advisories without treating them as
  failures.
- Agent launch prompts now describe the actual host shell, quote browser element references
  correctly on PowerShell, and report whether the supplied application URL was reachable before
  the run started.
- Updated the bundled review, spirit, Dance, and htmx guidance for committed-change review,
  complete remediation handoff, strict Spernakit version pins, and the adopted htmx 4 contract.

### Fixed

- Corrected execution-row navigation, alignment, and selection semantics so Live Console selection
  stays on labeled buttons with visible keyboard focus and no redundant focusable row target.
- Corrected run-history latency and outcome reporting by reading independent sources concurrently,
  distinguishing concurrent operator edits from run-attributed residue, and keeping benign backend
  notices out of failure classification.
- Added conditional revalidation for unhashed static assets and kept browser theme metadata aligned
  with the effective light, dark, or system theme.
- Improved control-panel accessibility for shell names, dialog scrolling, dashboard heading order,
  telemetry chart data, and System Metrics loading and failure announcements.
- Prevented denied browser storage from breaking Web Vitals collection and kept the exact crawltest
  diagnostic opt-in intact.
- Kept the Spernakit template repository subject to whole-tree change accounting while preserving
  the template-owned carve-out for derived applications.

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
