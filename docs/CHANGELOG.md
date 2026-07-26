# Changelog

All notable public aidd releases are documented here.

## [2.133.0] - 2026-07-26

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
