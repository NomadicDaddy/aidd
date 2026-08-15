# Changelog

All notable public aidd releases are documented here.

## [2.139.1] - 2026-08-14

### Changed

- Project Detail uses clearer row, dialog, tree, and disclosure patterns across Code, Artifacts,
  Reports, Milestones, Dependencies, Diary, Notes, Features, and History. The Features table now
  appears at laptop widths, while disabled controls recede without losing legibility.
- Feature statuses and audit sources now use readable labels throughout the Features and
  Dependencies tabs without changing stored values, filters, or mutation payloads.

### Fixed

- Filtered dependency graphs now calculate the selected feature's relationship counts, lists, and
  navigation from visible nodes only, so hidden relationships no longer appear in the details
  panel.
- Code tree indentation, active-row feedback, search result counts, source rhythm, focus rings, and
  copy-action iconography now remain consistent across supported Project Detail layouts.
