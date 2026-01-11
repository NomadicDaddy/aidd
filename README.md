# AIDD - AI Development Driver

A unified shell script that orchestrates autonomous development sessions using **OpenCode**, **KiloCode**, or **Claude Code** AI CLIs. AIDD provides a consistent interface for AI-driven development regardless of which CLI you prefer.

## Features

- **Multiple CLI Support**: Seamlessly switch between OpenCode, KiloCode, and Claude Code
- **Unified Interface**: Identical workflow and features across all CLIs
- **Project Management**: Automatic project initialization, scaffolding, and metadata tracking
- **Iteration Management**: Built-in retry logic, failure handling, and progress tracking with two-stage idle timeout and agent nudging
- **Feature Tracking**: JSON-based feature list with status tracking
- **Shared Directory Sync**: Automatic synchronization of shared configuration directories (e.g., `.claude`, `.windsurf`) to projects
- **Legacy Migration**: Automatic migration from `.automaker` directories

## Supported CLIs

### OpenCode

- Command: `opencode run`
- Default CLI if `--cli` is not specified

### KiloCode

- Command: `kilocode --mode code --auto`
- Specify with `--cli kilocode`

### Claude Code

- Command: `claude --print --output-format stream-json --verbose --dangerously-skip-permissions --no-session-persistence`
- Specify with `--cli claude-code`
- Uses your Claude Pro subscription
- No legacy directory (new integration)
- **Features**:
    - Stream-json output with real-time JSON parsing
    - Formatted console output ([ASSISTANT], [TOOL USE], [TOKENS])
    - Full JSON preserved in transcript files for debugging
    - Token usage tracking including cache hits

## Installation

1. Ensure you have one of the supported CLIs installed:
    - **OpenCode**: [Installation instructions](https://opencode.ai)
    - **KiloCode**: [Installation instructions](https://kilocode.ai)
    - **Claude Code**: Install from [claude.com/claude-code](https://claude.com/claude-code)
2. Clone or download AIDD to your local machine
3. Make the script executable:
    ```bash
    chmod +x aidd.sh
    ```

## Usage

### Basic Syntax

```bash
./aidd.sh [--cli {opencode|kilocode|claude-code}] --project-dir <dir> [OPTIONS]
```

### Required Arguments

- `--project-dir DIR`: Target project directory

### Optional Arguments

- `--cli CLI`: CLI to use (`opencode`, `kilocode`, or `claude-code`, default: `opencode`)
- `--spec FILE`: Specification file (required for new projects)
- `--max-iterations N`: Number of iterations (unlimited if not specified)
- `--timeout N`: Timeout in seconds (default: 600)
- `--idle-timeout N`: Idle timeout in seconds (default: 360)
- `--idle-nudge-timeout N`: Idle nudge timeout in seconds - sends "are you stuck?" message (default: 180)
- `--model MODEL`: Model to use (optional)
- `--init-model MODEL`: Model for initializer/onboarding prompts
- `--code-model MODEL`: Model for coding prompts
- `--no-clean`: Skip log cleaning on exit
- `--quit-on-abort N`: Quit after N consecutive failures (default: 0=continue indefinitely)
- `--continue-on-timeout`: Continue to next iteration on timeout
- `--feature-list`: Display project feature list status and exit
- `--todo`: Use TODO mode (work on todo items instead of new features)
- `--help`: Show help message

## Examples

### Using OpenCode (Default)

```bash
# New project with OpenCode
./aidd.sh --project-dir ./myproject --spec ./specs/myapp.md

# Existing project with specific model
./aidd.sh --project-dir ./myproject --model gpt-4 --max-iterations 5

# Existing project with specific model, in todo prioritizing mode
./aidd.sh --project-dir ./myproject --model gpt-4 --todo

# With different models for init and coding
./aidd.sh --project-dir ./myproject --init-model claude --code-model gpt-4
```

### Using KiloCode

```bash
# New project with KiloCode
./aidd.sh --cli kilocode --project-dir ./myproject --spec ./specs/myapp.md

# Existing project
./aidd.sh --cli kilocode --project-dir ./myproject --max-iterations 10
```

### Using Claude Code

```bash
# New project with Claude Code
./aidd.sh --cli claude-code --project-dir ./myproject --spec ./specs/myapp.md

# Existing project with specific model
./aidd.sh --cli claude-code --project-dir ./myproject --model sonnet --max-iterations 10

# Using different models for init and coding
./aidd.sh --cli claude-code --project-dir ./myproject --init-model opus --code-model sonnet
```

### Other Operations

```bash
# Display feature list
./aidd.sh --project-dir ./myproject --feature-list
```

## Workflows

### New Project Workflow

For empty or non-existent directories:

1. Creates project directory if it doesn't exist
2. Copies scaffolding files from `scaffolding/` directory
3. Copies templates into `project-dir/.aidd/`
4. Copies spec file to `.aidd/spec.txt` (if `--spec` is provided)
5. Uses `initializer` prompt to set up initial project structure
6. Creates `feature_list.json` based on the provided spec

### Existing Codebase Workflow

For directories containing code but no `.aidd/` files:

1. Skips copying scaffolding files
2. Does NOT copy spec file
3. Uses `onboarding` prompt to:
    - Analyze existing codebase
    - Generate `spec.txt` based on discovered functionality
    - Create `feature_list.json` with existing features marked as complete
    - Document project structure and technical debt

### Subsequent Iterations

Once `.aidd/spec.txt` and `.aidd/feature_list.json` exist:

- Uses `coding` prompt for continued development
- Implements remaining features from the feature list

### Shared Directory Synchronization

AIDD can automatically synchronize shared configuration directories to projects at the start of each iteration. This is useful for ensuring all projects have the latest IDE configurations, linting rules, or other shared resources.

**Configuration:**

Create a `copydirs.txt` file in the AIDD directory with one absolute path per line:

```
# copydirs.txt example
/d/applications/.claude
/d/applications/.windsurf
/home/user/.vscode
/Users/username/dev/shared-configs/.eslintrc.json
```

**Behavior:**

- Runs at the start of each iteration before the CLI prompt
- Uses `rsync -av --delete` (falls back to `cp -R` if rsync unavailable)
- Logs which directories were refreshed
- Skips missing source directories with a warning

**Common Use Cases:**

- Syncing IDE configuration (`.vscode`, `.windsurf`, `.claude`)
- Sharing linting rules across projects
- Distributing common scripts or templates
- Keeping project guidelines up to date

## Project Structure

```
aidd/
├── aidd.sh                 # Main script
├── copydirs.txt           # List of shared directories to sync to projects
├── lib/
│   ├── args.sh            # Argument parsing
│   ├── cli-claude-code.sh # Claude Code CLI implementation
│   ├── cli-factory.sh     # CLI abstraction layer
│   ├── cli-kilocode.sh    # KiloCode CLI implementation
│   ├── cli-opencode.sh    # OpenCode CLI implementation
│   ├── config.sh          # Configuration constants
│   ├── iteration.sh       # Iteration handling
│   ├── json-parser.sh     # JSON stream parser for Claude Code
│   ├── log-cleaner.sh     # Native bash log cleaning
│   ├── project.sh         # Project management
│   └── utils.sh           # Utility functions
├── prompts/
│   ├── _common/           # Shared prompt modules (refactored v2.0)
│   │   ├── assistant-rules-loading.md
│   │   ├── project-overrides.md
│   │   ├── testing-requirements.md
│   │   ├── file-integrity.md
│   │   ├── hard-constraints.md
│   │   ├── tool-selection-guide.md
│   │   └── error-handling-patterns.md
│   ├── onboarding.md      # Onboarding prompt (existing codebases)
│   ├── initializer.md     # Initializer prompt (new projects)
│   ├── coding.md          # Coding prompt (development iterations)
│   ├── todo.md            # TODO mode prompt
├── scaffolding/           # Template files for new projects
├── templates/             # Project metadata templates
└── specs/                 # Specification examples

Project Metadata (.aidd/):
.aidd/
├── spec.txt               # Project specification
├── feature_list.json      # Feature tracking
├── todo.md                # TODO items
├── project_structure.md   # Architecture documentation
└── iterations/            # Iteration logs
    ├── 001.log
    ├── 002.log
    └── ...
```

## How It Works

1. **CLI Initialization**: Determines which CLI to use (OpenCode or KiloCode)
2. **Project Detection**: Detects if the target directory is an existing codebase
3. **Metadata Setup**: Creates or migrates `.aidd` directory
4. **Iteration Loop**: Runs in a loop based on `--max-iterations`:
    - Determines appropriate prompt (onboarding, initializer, or coding)
    - Executes prompt through selected CLI
    - Captures transcript to numbered log file
    - Handles failures with retry logic
5. **Log Cleanup**: Optionally cleans up iteration logs on exit

## Iteration Transcripts

Each iteration writes a transcript file under:

```
project-dir/.aidd/iterations/001.log
project-dir/.aidd/iterations/002.log
...
```

The transcript captures the console output for that iteration. The log index is chosen as the next number after the highest existing numeric `*.log` in that directory, so logs are never overwritten across re-runs.

## CLI Abstraction

AIDD uses a factory pattern to abstract CLI differences:

- **cli-factory.sh**: Provides unified interface (`run_cli_prompt`, `check_cli_available`, etc.)
- **cli-opencode.sh**: OpenCode-specific implementation
- **cli-kilocode.sh**: KiloCode-specific implementation
- **cli-claude-code.sh**: Claude Code-specific implementation

This allows the same codebase to support all CLIs with minimal differences.

## Legacy Migration

AIDD automatically migrates metadata from `.automaker` directories to `.aidd`.

## Error Handling

AIDD includes comprehensive error handling:

- **Exit Codes**: 0 (success), 1 (general error), 2 (invalid args), 70 (no assistant), 71 (idle timeout), 72 (provider error), 124 (signal terminated)
- **Retry Logic**: Configurable with `--quit-on-abort`
- **Two-Stage Idle Timeout**: When an agent becomes unresponsive:
    - Stage 1: After idle-nudge-timeout (default 180s), sends "are you stuck?" message to the agent
    - Stage 2: If still no response after remaining time, terminates the session
    - Total timeout is still controlled by `--idle-timeout` (default 360s)
- **Timeout Detection**: Monitors both overall timeout and idle timeout
- **Provider Error Detection**: Detects and handles API errors gracefully

## Requirements

- Bash 4.0+
- One of the supported CLIs installed and in PATH:
    - OpenCode (`opencode`)
    - KiloCode (`kilocode`)
    - Claude Code (`claude`)
- jq (required for Claude Code JSON parsing; optional for `--feature-list` display)
- rsync (optional, for shared directory synchronization - falls back to `cp` if unavailable)

## Version History

- **v2.2.0** (2026-01-09):
    - Added Claude Code CLI support with stream-json parsing
    - Implemented JSON parser for readable console output
    - Added token usage tracking for Claude Code
    - Updated all documentation to reflect triple CLI support
- **v2.1.0** (2026-01-09):
    - Added two-stage idle timeout with agent nudging feature
    - Added shared directory synchronization (copydirs.txt)
    - Refactored prompts to modular architecture (see prompts/PROMPT_CHANGELOG.md)
    - Fixed CLI name display bug in error messages
    - Fixed coprocess file descriptor handling in nudge feature
- **v2.0.0** (2026-01-08): Unified AIDD supporting both OpenCode and KiloCode
- **v1.1.0**: aidd-o (OpenCode) and aidd-k (KiloCode) as separate projects
- **v1.0.0**: Initial aidd-o release

## Architecture

AIDD follows a modular architecture with clear separation of concerns:

1. **Configuration Layer** (`config.sh`): Defines all constants and defaults
2. **Utility Layer** (`utils.sh`): Provides logging, file operations, and helpers
3. **CLI Abstraction Layer** (`cli-factory.sh`, `*-cli.sh`): Abstracts CLI differences
4. **Business Logic Layer** (`args.sh`, `project.sh`, `iteration.sh`): Core functionality
5. **Main Script** (`aidd.sh`): Orchestrates everything

## Support

For issues or questions:

1. Check the `--help` output
2. Review iteration logs in `.aidd/iterations/`
3. Check CLI-specific documentation:
    - OpenCode: [opencode.ai/docs](https://opencode.ai/docs)
    - KiloCode: [kilocode.ai/docs](https://kilocode.ai/docs)
    - Claude Code: [claude.com/claude-code](https://claude.com/claude-code)
4. Refer to the original aidd-o or aidd-k projects for historical context
