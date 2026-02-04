# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.1] - 2026-02-04

### Added

- Rate limit detection: monitors CLI output for `"hit your limit"` and `"rate_limit"` JSON error patterns
- Intelligent pause on rate limit: parses API reset time from rate limit messages (e.g., "resets 2am") and sleeps until reset + configurable buffer
- New exit code `EXIT_RATE_LIMITED` (74) for explicit rate limit signaling
- New config constants: `DEFAULT_RATE_LIMIT_BUFFER` (60s post-reset buffer), `DEFAULT_RATE_LIMIT_BACKOFF` (300s fallback when reset time unparseable)
- `parse_rate_limit_reset()` in `lib/iteration.sh` — extracts and converts reset timestamps from rate limit messages
- `handle_rate_limit()` in `lib/iteration.sh` — orchestrates sleep-until-reset with buffer and fallback logic
- `[RATE_LIMITED]` output tag in `lib/json-parser.sh` for rate-limited result events
- `rate_limited` status mapping for exit code 74 in `lib/log-extractor.sh`

### Changed

- Rate-limited iterations no longer consume log file numbers — log file is removed and index decremented before retry
- `monitor_coprocess_output()` in `lib/utils.sh` now detects rate limit patterns and terminates the CLI process early
- `handle_script_exit()` in `aidd.sh` treats `EXIT_RATE_LIMITED` as a resumable condition (no failure counter increment)

## [0.9.0] - 2026-02-03

### Added

- `--audit-model MODEL` flag: specify a separate model for audit prompts (falls back to `--code-model`, then `--model`)
- `--audit-on-completion AUDIT[,...]` flag: automatically run specified audits when a project reaches confirmed completion
- `--code-after-audit` flag: after audits complete, run coding iterations to remediate findings, then re-audit — loops until no unfixed findings remain (max 10 cycles)
- `count_unfixed_audit_findings()` helper in `lib/iteration.sh` for detecting unremediated audit findings
- `run_audit_set()` helper in `aidd.sh` to reduce duplication in multi-audit execution
- Audit Model displayed in iteration header Model Settings section

### Changed

- Audit prompts now use `AUDIT_MODEL_ARGS` instead of `CODE_MODEL_ARGS`, enabling independent model selection for audits
- Refactored audit execution section into `run_audit_set()` helper for reuse by post-completion and remediation flows

## [0.8.2] - 2026-02-02

### Added

- Audit lifecycle phases: `development`, `pre-release`, `post-release`, `migration`, `specialized`, `reference` — each audit's frontmatter now includes a `lifecycle:` field
- Lifecycle-organized section in `docs/audit_guide.md` with phase descriptions, tables, and copy-paste CLI commands
- Audit feedback loop: audit finding `spec` fields now instruct the resolving agent to trace back and update the original feature.json(s) that produced the problematic code, preventing regression during feature-based rebuilds

## [0.8.1] - 2026-02-02

### Added

- Deferred TODO syntax `- [~]` and `- [!]` — items requiring manual/external action that don't block project completion
- Deferred TODO display in `show_status` output with count and listing

### Fixed

- Project completion blocked forever by unresolvable TODOs: `has_todos` now ignores deferred `[~]`/`[!]` items
- Stuck detection reset by `.automaker/` metadata formatting drift (e.g. Prettier on status.md): git porcelain diff now excludes `.automaker/` paths
- `waiting_approval` features with invalid structure (missing `id`/`category`) counted as failing and blocked completion: status check now runs before structural validation
- Completion markers (`.project_completed`, `.project_completion_pending`) deleted when only TODOs block but all features pass: markers now preserved unless features are actually failing

## [0.8.0] - 2026-01-31

### Added

- Stuck detection: abort after 3 consecutive iterations with no git changes (4d3c968)
- `waiting_approval` status for features that can't be runtime-verified, held for human review (4d3c968)
- Graceful shutdown via `--stop` flag or `.automaker/.stop` file (6887521)
- Two-phase project completion detection with `.project_completed` marker (6887521)
- Changelog generator script for automated Keep a Changelog output from features (4f04282)
- Spernakit registry version update in changelog generator (11892b2)
- Automated rebuild and parity audit tooling: `audit-parity.sh`, `diff-template.sh`, `generate-features.sh`, `pre-rebuild-check.sh` (b1b7d0f)
- Parity audit `.parity-ignore` file support for excluding known false positives (944ae99)
- UI_PARITY audit specification for post-rebuild/migration gap detection (894ef1c)
- `agent-browser` CLI as preferred browser automation method across all prompts (50c51c9)
- Comprehensive code audit guides: hygiene, reorganization, UI separation, dead code (dbd28e0)
- Auto-rebuild guide for spernakit applications (0b5ab32)
- Prompt selection logic documentation (`docs/prompt-selection-logic.md`)

### Fixed

- Infinite loop on project completion caused by exit inside subshell (6887521)
- Incomplete TODO detection counting headers and completed items as incomplete (9913a16)

### Changed

- Prompts made fully environment-agnostic, replacing hardcoded tool names with generic descriptions (033fe6f)
- Git workflows updated to use selective file staging instead of `git add .` (f9747a6)
- Prompt system alignment pass: `in-progress.md`, `todo.md`, `validate.md` rewritten to match `coding.md` baseline — added three-strike rule, code review step, browser fallback paths, iteration management, `waiting_approval` guidance
- Common modules consistency pass: fixed `progress.md` → `CHANGELOG.md` references, `backlog` → `waiting_approval` for blocked features, test runner policy clarified, echo file strategy replaced with tool-based writes, port list corrected, dev server backgrounding fixed
- `validate.md` upgraded from code-inspection-only to tiered verification model with runtime verification, `waiting_approval` for unverifiable features, and verification hierarchy
- `onboarding.md` and `initializer.md` Common Guidelines tables normalized
- `flow.md` updated with full prompt selection cascade and complete mermaid diagram
- Severity classification updated to v2.0 with feature.json output format (0b5ab32)
- Scaffolding configs: expanded gitignore/prettierignore, removed `@trivago/prettier-plugin-sort-imports` dependency (dbd28e0)
- Feature validation performance improved with batched jq calls and cached feature states (6490de5, 0c4805b)
- Onboarding status check logging improved with diagnostic warnings (4872929)

## [0.7.0] - 2026-01-25

### Added

- Status breakdown with remediation ID support for better progress tracking (2adf0b1)
- Comprehensive iteration header with full run configuration display (86d2929)
- CLI-specific prompt templates for better tool compatibility (ee50867)

### Changed

- Streamlined prompt documentation, removed redundant references (0b6c6f4)
- Updated audit stack reference paths (f43383b)
- Prioritized audit findings in feature selection workflow (c8d26d0)

## [0.6.0] - 2026-01-19

### Added

- Audit mode with multi-audit support and comprehensive audit definitions (43d22d8)
- Feature dependency validation to ensure dependencies reference existing features (89eb3d5)
- Audit ID validation format support (9e5b0e6)
- React best practices audit template (39727da)

### Changed

- Expanded audit framework with feature utilization and anti-pattern detection (9066315)
- Updated feature directory naming convention documentation (8786f06)

## [0.5.0] - 2026-01-14

### Added

- In-progress mode (`--in-progress`) to focus only on features with "in_progress" status (74152d9)
- Stop-when-done flag (`--stop-when-done`) for early mode completion (a9d31a4)
- Shared file copy functionality via `copyfiles.txt` (ce35d9a)

### Changed

- Updated feature ID format and made title required in schema (40a29fe)
- Enforced browser-based testing in status checks (e221aea)

## [0.4.0] - 2026-01-12

### Added

- Validate mode (`--validate`) to check incomplete features and TODOs (b30b164)
- Automatic OpenCode config generation to prevent permission prompts (d4e0dc0)
- Structured log extraction for iterations (`--extract-structured`) (9d48889)
- Feature file structure validation and metadata checks (b9c716b)
- Feature file JSON validation and dependency checks (91c94ed)
- Pre-commit hook and smoke test for CI (12f8094, 532a575)
- Shell syntax checking script (556df59)

### Changed

- **BREAKING**: Renamed `.aidd` directory to `.automaker` (c427a31)
- Migrated to features directory structure with enhanced completion detection (b44abe9)
- Updated feature schema with nested metadata and standardized field names (4178158)
- Renamed DEFAULT_AIDD_SPEC_FILE to DEFAULT_SPEC_FILE (d963dcf)

## [0.3.0] - 2026-01-11

### Added

- Custom directive mode (`--prompt`) for ad-hoc instructions (ca6726a)
- Feature dependency tracking system (ca6726a)
- Bidirectional AIDD-AutoMaker synchronization with schema alignment (ff7389b)

### Changed

- Updated shared feature tracking description in README (628dc5e)

## [0.2.0] - 2026-01-10

### Added

- Enhanced project status with TODO tracking and auto-generation (e8afa74)
- CHANGELOG.md template for target projects (50064e7)

### Fixed

- Workflow Step 5: prevent agent from inventing MVP/post-MVP filter (b2fb15c)
- Agent exit behavior: should exit cleanly without errors (6d7416d)
- Bash syntax error: removed 'local' keyword from non-function scope (31c2389)

### Changed

- **BREAKING**: Renamed 'artifacts' directory to 'templates' (ca094ed)
- Moved status generation to before prompt invocation (aba463d)
- Removed progress.md in favor of CHANGELOG.md (fa8b14f)
- Removed todo.md existence check in TODO mode (5dd8219)

## [0.1.0] - 2026-01-09

### Added

- Claude Code CLI support (`--cli claude-code`) (0469e5f)
- Stream-json output support and new CLI flags for Claude Code (9a6c61e)
- JSON parser for stream-json output (825c1d1)
- Idle nudge timeout and shared directory sync (eca5102)

### Fixed

- Loop detection and exit code handling in iteration system (1996e7d)

### Changed

- Increased idle timeout from 180s to 360s (e7a30df)
- Removed time limit for agent during coding phase (06debec)
- Removed PowerShell references for cross-platform compatibility (3d21bf1)
- Redirected logging output to stderr and added sync exclusions (4f3e2e2)
- Prepared codebase for public open-source release (dfc7455)

## [0.0.1] - 2026-01-08

### Added

- Initial release with modular architecture
- Unified AIDD with dual CLI support (OpenCode and KiloCode) (ddc9d6b)
- Core library structure with separate modules for config, utils, args, CLI factory, project management, and iteration handling
- Prompt-based workflow system with onboarding, initializer, and coding phases
- Shared directory synchronization
- Configurable timeouts and iteration limits

### Changed

- Simplified library structure and removed unused code (2565249)
- Consolidated CLI monitoring and enhanced system security (b0d30e4)

[0.9.1]: https://github.com/NomadicDaddy/aidd/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/NomadicDaddy/aidd/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/NomadicDaddy/aidd/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/NomadicDaddy/aidd/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/NomadicDaddy/aidd/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/NomadicDaddy/aidd/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/NomadicDaddy/aidd/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/NomadicDaddy/aidd/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/NomadicDaddy/aidd/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NomadicDaddy/aidd/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/NomadicDaddy/aidd/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NomadicDaddy/aidd/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/NomadicDaddy/aidd/releases/tag/v0.0.1
