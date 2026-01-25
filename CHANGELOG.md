# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.7.0]: https://github.com/NomadicDaddy/aidd/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/NomadicDaddy/aidd/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/NomadicDaddy/aidd/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/NomadicDaddy/aidd/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NomadicDaddy/aidd/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/NomadicDaddy/aidd/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NomadicDaddy/aidd/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/NomadicDaddy/aidd/releases/tag/v0.0.1
