# Changelog

All notable changes to AIDD (AI Development Director) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CHANGELOG.md for tracking project changes (Keep a Changelog format)
- Changelog update instructions in all iteration prompts (coding, todo, initializer)
- Automatic status generation after each successful iteration
- Project status now includes TODO tracking from markdown files
- TODO file search in multiple locations (.aidd/todo.md, todo.md, TODO.md, etc.)
- Division-by-zero protection in percentage calculations

### Changed
- Renamed `--feature-list` flag to `--status` for broader scope
- Package.json start script changed from `bun` to `bash` for portability
- Status report now displays both features and TODO items

### Fixed
- Auto-completion exit logic now executes after status generation

## [2.2.0] - 2026-01-09

### Added
- Claude Code CLI support with stream-json parsing
- JSON parser (`lib/json-parser.sh`) for readable console output
- Token usage tracking for Claude Code including cache hits
- Formatted console output ([ASSISTANT], [TOOL USE], [TOKENS])

### Changed
- Updated all documentation to reflect triple CLI support (OpenCode, KiloCode, Claude Code)
- Full JSON preserved in transcript files for debugging

### Fixed
- jq dependency documented as required for Claude Code JSON parsing

## [2.1.0] - 2026-01-09

### Added
- Two-stage idle timeout with agent nudging feature
- Shared directory synchronization (copydirs.txt)
- Modular prompt architecture (see prompts/PROMPT_CHANGELOG.md)

### Fixed
- CLI name display bug in error messages
- Coprocess file descriptor handling in nudge feature

## [2.0.0] - 2026-01-08

### Added
- Unified AIDD supporting both OpenCode and KiloCode CLIs
- CLI abstraction layer for multi-CLI support
- CLI factory pattern for extensibility

### Changed
- Merged aidd-o (OpenCode) and aidd-k (KiloCode) into single unified tool
- Refactored architecture to support multiple CLI backends

## [1.1.0] - 2026-01-XX

### Added
- Separate aidd-o (OpenCode) and aidd-k (KiloCode) implementations

## [1.0.0] - 2025-XX-XX

### Added
- Initial release of aidd-o (OpenCode version)
- Basic autonomous development iteration loop
- Feature list management
- Progress tracking
- Iteration logging

[Unreleased]: https://github.com/NomadicDaddy/aidd/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/NomadicDaddy/aidd/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/NomadicDaddy/aidd/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/NomadicDaddy/aidd/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/NomadicDaddy/aidd/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/NomadicDaddy/aidd/releases/tag/v1.0.0
