# Changelog

All notable public aidd releases are documented here.

## [2.138.0] - 2026-08-13

### Added

- The `refresh-project-artifacts` skill brings one local project's whole artifact catalog back in
  line with what the code actually does. It reads `docs/reference/artifacts.md` at runtime and
  works the table row by row rather than from a remembered list, handing each artifact to the
  workflow that owns it. `--dry-run` reports the work without writing anything. The
  `reconcile project artifacts` recipe now runs the skill and then recalculates artifact status,
  so a single recipe covers both halves of the job.

### Changed

- The web panel is usable at phone and tablet widths. Every page was worked through at 390 and 768
  pixels: Dashboard, Runs, Projects and each project detail tab, Director, Audits, Recipes, Skills,
  Telemetry, Diary, Pipeline Sessions, Settings, and Docs. Controls, labels, and actions stay
  reachable instead of being clipped or pushed off screen, and the desktop composition is unchanged.
- Shared layout primitives size themselves from their own content width rather than from viewport
  breakpoints. Page headers, card header actions, metric summaries, and filter toolbars now respond
  to the space they are actually given, so a component in a narrow column behaves the same as one
  on a narrow screen.
- Filter toolbars keep Search visible at small widths and move the secondary filters into a shared
  dialog that reports how many are active. Audits and Skills catalogs switch to a reversible
  master-detail flow on narrow screens, restoring focus on the way back and warning before a dirty
  selection is dropped. Director bounds its chat and suggestion histories behind disclosures.
  Project Code puts the file tree in a labelled disclosure ahead of the viewer.
- The sidebar scrolls the active or keyboard-focused destination into view on short viewports and
  drops its continuation cue once the list is scrolled to the end.
- The Docs glossary renders as real definition lists instead of flat bullets, the docs
  navigation and on-this-page regions are named for screen readers, inline code is easier to pick
  out of running text, and the pages link the destinations they mention.
- The `frontend-design-sweep` skill takes a variable-length set of viewports per mode rather than a
  fixed pair. The first viewport is the one findings are reported against, and the rest are
  captured to catch width-specific problems.

### Fixed

- A run no longer fails its completion gate over a file it never opened. The gate charged every
  dirty path to the run, so an operator editing anything in the shared worktree while the agent
  finished would demote a completed feature to `waiting_approval` and exit 7. It now uses the same
  attribution the run-end report already applied and leaves unattributable changes alone.
- `crawltest` finds the Project Features Status and Source selects through the responsive filter
  markup, where they sit inside a `display: contents` wrapper. A successful crawl was exiting 1
  because the old direct-child lookup found no Source options. The feature-filter assertion that
  was silently skipping also runs now.
- Docker installs its runtime packages from a `snapshot.debian.org` archive frozen at a build-arg
  timestamp, with `ca-certificates`, `git`, and `tini` pinned on top. The base image was pinned by
  digest but its apt step was not, so the recorded package inventory drifted whenever Debian
  published an update and a fresh CI build failed a license check that a cached local build passed.
- `release:package` writes `licenses/releases/vX.Y.Z.md` only when `--retain-record` asks for it.
  Every local run used to leave that file untracked, which `release:check` then refused to build
  from, and the record a laptop produces describes a zip that never ships.
- Audits overrides stay within their column at constrained widths, and the Skills catalog states
  its count the same way every other catalog does.
