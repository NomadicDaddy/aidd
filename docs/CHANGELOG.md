# Changelog

All notable public aidd releases are documented here.

## [2.139.1] - 2026-08-15

### Added

- Skills and Recipes filters now live in the URL. Filtered catalog views can be bookmarked,
  shared, restored from a direct link, and traversed with browser history without losing unrelated
  query parameters.
- The backend adapter smoke matrix now covers every registered backend and is keyed by the
  canonical backend list, so adding another backend requires a corresponding smoke entry.

### Changed

- Project Detail uses consistent content measures, heading levels, status tones, and table
  breakpoints across Audits, Runs, Features, History, Repository, Diary, Notes, Artifacts,
  Interview, Reports, Milestones, Management, Dependencies, and Overview.
- The Audits tab uses the same empty states, scrolling, tooltips, actions, and active-finding
  details in compact and table layouts, including when the navigation rail changes the available
  content width.
- Director keeps Suggestions directly below Recent Cycles, Docs keeps its navigation, article,
  and outline together, and Diary uses the same full-width page shell as the rest of the panel.
- Dashboard feature cards read the project-summary projection directly, removing the per-project
  detail request fan-out while preserving waiting-approval actions and feature status details.
- Project Detail uses clearer row, dialog, tree, and disclosure patterns across Code, Artifacts,
  Reports, Milestones, Dependencies, Diary, Notes, Features, and History. The Features table now
  appears at laptop widths, while disabled controls recede without losing legibility.
- Feature statuses and audit sources now use readable labels throughout the Features and
  Dependencies tabs without changing stored values, filters, or mutation payloads.

### Fixed

- Query-backed tab changes now trigger the unsaved-changes confirmation, and Project deletion
  accepts case and separator variants of the full displayed path while retaining the backend's
  canonical-path check.
- Persisted browser stores keep working in memory when local storage reads or writes fail. Form
  controls meet non-text contrast, disclosure triggers respond to hover, and port-status dots have
  accessible graphic names.
- Dependency graph edges remain legible at rest, skipped artifacts no longer show a conflicting
  missing badge, preserved interview drafts use a neutral tone, and run advisories stay distinct
  from successful outcomes.
- Stale-heartbeat cleanup now releases the dead run's feature leases, preventing a crashed run from
  keeping later work locked.
- Benchmark, end-to-end smoke, and backend-matrix transcripts stay with their temporary artifacts
  instead of entering the control panel's live run-log directory.
- Filtered dependency graphs now calculate the selected feature's relationship counts, lists, and
  navigation from visible nodes only, so hidden relationships no longer appear in the details
  panel.
- Code tree indentation, active-row feedback, search result counts, source rhythm, focus rings, and
  copy-action iconography now remain consistent across supported Project Detail layouts.
