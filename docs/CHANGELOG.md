# Changelog

All notable public aidd releases are documented here.

## [2.131.0] - 2026-07-22

### Baseline capabilities

- Directs AI-assisted development from project discovery and blueprint creation through feature
  execution, review, audit, testing, and release preparation.
- Provides CLI and local web-control-panel workflows backed by a shared orchestration, metadata,
  configuration, and run-history implementation.
- Supports native and external agent backends with explicit approval gates, bounded execution,
  worktree isolation, resumable runs, and persisted iteration evidence.
- Ships maintained catalogs of audits, skills, prompts, recipes, and project scaffolding with
  feature, roadmap, assertion, screen-map, and testing-scenario contracts.
- Includes repository hygiene, dependency, security, licensing, architecture, accessibility,
  performance, and deployment checks suitable for both interactive use and CI.
- Builds self-contained CLI and web binaries with their frontend and catalog assets, exact source
  manifests, checksums, license notices, and corresponding-source records.

### Release integrity

- Release packaging copies only Git-tracked catalog and documentation assets and cleans the output
  directory before staging a candidate.
- Distributed material is classified in `licenses/distributed-materials.json`; registry paths,
  packager surfaces, attribution notices, and archive contents are validated together.
- Release validation requires the exact current-version archive and stage names, exact catalog
  parity, current source revision metadata, and the complete runtime and third-party notice set.
- The fresh-release gate prevents public baseline content from acquiring pre-baseline aidd release
  records, changelog entries, artifact names, or repository-history narratives.
