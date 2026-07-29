# Changelog

All notable public aidd releases are documented here.

## [2.136.0] - 2026-07-29

### Added

- The Features tab now shows which release each completed feature shipped in, as a Shipped column
  on the desktop table and a matching entry on the mobile card. Features that are not completed
  show a dash, since a stamp left from an earlier completion says nothing about the revision
  currently in flight.
- Milestone auto-placement reconciles completed features against the version they actually shipped
  in, pulling a feature back to the milestone matching that version when it was filed ahead of the
  release line. Completed features with no recorded version are placed by the app's current version
  and stamped with a dated note marking that the version was inferred.
- New `spernakit-dance-resume` recipe for restarting an interrupted fleet dance. The existing
  `spernakit-dance` recipe re-aligns the template docs and ships a release, so re-running it after a
  crash re-tags a template the fleet already took; the resume recipe is the single skill step with
  the resume flags exposed as a parameter.
- `--check-features` warns when a feature's text contains a literal `\n` where a real newline was
  meant. The file still parses and every other check passes, so this only used to surface when
  someone opened the spec and found the numbered criteria run together on one line.
- The Runs page names exit code 75 as a flailing stop instead of a bare "Failed".

### Changed

- `roadmap:apply` no longer rewrites template-owned feature records in a derived app. Those records
  are copies that the next template sync overwrites, so rewriting their dependencies or stamping
  their `updatedAt` here just churns them until the sync reverts it; only the app-local priority is
  written, and the summary counts them separately. The same records inside the Spernakit template
  itself are still written normally.
- `roadmap:apply` writes feature files using the target project's own formatting config, so applying
  a roadmap no longer reformats every file it touches.
- `features:status` classifies features by directory name alone, so an ordinary feature whose name
  starts with `audit-` is counted as a feature rather than an audit finding.
- The app-address block in agent launch prompts no longer reads as a veto on the project's own
  scripts. A fleet release refused to run its release script, which rebuilds and restarts the app as
  part of its own run, and parked the pipeline citing that text. Starting your own instance to
  verify against is still banned, along with port scans and listening-process hunts, but a test, QC,
  or release script that manages a server as part of its own run is ordinary work.
- The bundled Dance skill starts each app itself before the per-app verification phase rather than
  assuming one is already running, and its checkpoint records per-app outcomes so a resume skips the
  apps that already finished.
- Retired the `interview-postq-resume` recipe.
- Refreshed development dependencies.

### Fixed

- The flailing guard no longer kills a parallel fan-out. A command issued once per checkout and
  dispatched in a single batch used to collapse into one repeated action, because the signature
  ignored the working directory and because every call in a batch arrives before any result comes
  back. Signatures now include the working directory when the backend reports one, and calls
  dispatched before the previous one reported back neither extend nor break the repeat streak.
- The flailing guard's banners now reach the run log. A web run the guard aborted showed a log that
  simply stopped, with nothing explaining why.
- A flailing stop records exit 75 instead of 0, so the panel no longer shows a failed run whose exit
  code says it succeeded. The run's worktree still merges back and its feature still parks for
  review, since the guard fires on a run's last iterations while earlier ones may have landed real
  work.
- Skills launched from the web panel with flag-style arguments no longer die at startup.
  `--skill-args` and `--prompt` were emitted as two argv tokens, and the CLI reads a
  space-separated value beginning with `--` as a missing value, so a skill launched with something
  like `--skill-args --apply` never reached a single line of work.
- The literal-newline check no longer flags specs that describe the escape rather than use it, such
  as text about how `\n` renders or a Windows path. Six of the fourteen occurrences it first
  reported were correct content that a repair would have corrupted.
