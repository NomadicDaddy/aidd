#!/bin/bash
# =============================================================================
# lib/cli-factory.sh - CLI Abstraction Factory for AIDD
# =============================================================================
# Provides a common interface for interacting with different CLI tools
# (OpenCode, KiloCode) through a factory pattern

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
            export CLI_LEGACY_METADATA_DIR="$LEGACY_METADATA_DIR_OPENCODE"
            source "$(dirname "${BASH_SOURCE[0]}")/opencode-cli.sh"
            ;;
        kilocode)
            export CLI_TYPE="kilocode"
            export CLI_NAME="KiloCode"
            export CLI_COMMAND="kilocode"
            export CLI_LEGACY_METADATA_DIR="$LEGACY_METADATA_DIR_KILOCODE"
            source "$(dirname "${BASH_SOURCE[0]}")/kilocode-cli.sh"
            ;;
        *)
            echo "Error: Unknown CLI type '$cli_type'" >&2
            echo "Supported CLIs: opencode, kilocode" >&2
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
        *)
            echo "unknown"
            ;;
    esac
}

