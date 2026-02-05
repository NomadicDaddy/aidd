#!/bin/bash
# =============================================================================
# lib/cli-factory.sh - CLI Abstraction Factory for AIDD
# =============================================================================
# Provides a common interface for interacting with different CLI tools
# (OpenCode, KiloCode, Claude Code) through a factory pattern

# Source configuration
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# -----------------------------------------------------------------------------
# CLI Selection and Initialization
# -----------------------------------------------------------------------------

# Initialize CLI based on the selected CLI type
# Usage: init_cli <cli_type>
# Sets global CLI_* variables for use by iteration and other modules
init_cli() {
    local cli_type="${1:-$DEFAULT_CLI}"

    case "$cli_type" in
        opencode)
            export CLI_TYPE="opencode"
            export CLI_NAME="OpenCode"
            export CLI_COMMAND="opencode run"
            source "$(dirname "${BASH_SOURCE[0]}")/cli-opencode.sh"
            ;;
        kilocode)
            export CLI_TYPE="kilocode"
            export CLI_NAME="KiloCode"
            export CLI_COMMAND="kilo"
            source "$(dirname "${BASH_SOURCE[0]}")/cli-kilocode.sh"
            ;;
        claude-code)
            export CLI_TYPE="claude-code"
            export CLI_NAME="Claude Code"
            export CLI_COMMAND="claude"
            source "$(dirname "${BASH_SOURCE[0]}")/cli-claude-code.sh"
            ;;
        *)
            echo "Error: Unknown CLI type '$cli_type'" >&2
            echo "Supported CLIs: opencode, kilocode, claude-code" >&2
            return "$EXIT_INVALID_ARGS"
            ;;
    esac

    return 0
}

# -----------------------------------------------------------------------------
# Common CLI Interface Functions
# -----------------------------------------------------------------------------
# These functions provide a unified interface that delegates to the
# CLI-specific implementations loaded by init_cli()

# Run CLI prompt with timeout and idle detection
# Usage: run_cli_prompt <project_dir> <prompt_path> [model_args...]
# Returns: Exit code from CLI or custom codes (70, 71, 72, 124)
run_cli_prompt() {
    case "$CLI_TYPE" in
        opencode)
            run_opencode_prompt "$@"
            ;;
        kilocode)
            run_kilocode_prompt "$@"
            ;;
        claude-code)
            run_claude_code_prompt "$@"
            ;;
        *)
            echo "Error: CLI not initialized. Call init_cli() first." >&2
            return "$EXIT_CLI_ERROR"
            ;;
    esac
}

# Check if CLI is available
# Usage: check_cli_available
# Returns: 0 if available, 1 if not
check_cli_available() {
    case "$CLI_TYPE" in
        opencode)
            check_opencode_available
            ;;
        kilocode)
            check_kilocode_available
            ;;
        claude-code)
            check_claude_code_available
            ;;
        *)
            echo "Error: CLI not initialized. Call init_cli() first." >&2
            return 1
            ;;
    esac
}

# Get CLI version
# Usage: get_cli_version
# Returns: Version string or empty string if not available
get_cli_version() {
    case "$CLI_TYPE" in
        opencode)
            get_opencode_version
            ;;
        kilocode)
            get_kilocode_version
            ;;
        claude-code)
            get_claude_code_version
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

