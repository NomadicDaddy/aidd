#!/bin/bash
# =============================================================================
# lib/kilocode-cli.sh - KiloCode CLI Interaction Module for AIDD
# =============================================================================
# Functions for interacting with KiloCode CLI, including error detection

# Note: This module is sourced by cli-factory.sh and should not be sourced directly
# Ensure utils.sh is loaded for monitor_coprocess_output function
if ! declare -f monitor_coprocess_output >/dev/null 2>&1; then
    source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
fi

# -----------------------------------------------------------------------------
# KiloCode CLI Configuration
# -----------------------------------------------------------------------------
: "${KILOCODE_CLI:="kilo"}"
: "${KILOCODE_MODE:="run"}"

readonly KILOCODE_CLI
readonly KILOCODE_MODE

# -----------------------------------------------------------------------------
# KiloCode CLI Interaction Functions
# -----------------------------------------------------------------------------

# Run KiloCode prompt with timeout and idle detection
# Usage: run_kilocode_prompt <project_dir> <prompt_path> [model_args...]
# Returns: Exit code from KiloCode or custom codes (70=no assistant, 71=idle timeout, 72=provider error)
run_kilocode_prompt() {
    local project_dir="$1"
    local prompt_path="$2"
    shift 2

    local -a model_args=("$@")

    log_debug "Running KiloCode prompt: $prompt_path"
    log_debug "Project directory: $project_dir"
    log_debug "Model args: ${model_args[*]}"
    log_debug "Timeout: ${TIMEOUT:-$DEFAULT_TIMEOUT}s, Idle: ${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s"

    # Build KiloCode command with model args
    local kilo_cmd="kilo $KILOCODE_MODE"
    if [[ ${#model_args[@]} -gt 0 ]]; then
        kilo_cmd="$kilo_cmd ${model_args[*]}"
    fi

    # Execute KiloCode in a coprocess to monitor output
    coproc {
        (cd "$project_dir" && cat "$prompt_path" | $kilo_cmd 2>&1);
    }

    # Use shared monitoring function (with "error" log level for errors)
    monitor_coprocess_output "error"
    return $?
}

# Check if KiloCode is available
# Usage: check_kilocode_available
# Returns: 0 if available, 1 if not
check_kilocode_available() {
    if command_exists "$KILOCODE_CLI"; then
        log_debug "KiloCode CLI found: $KILOCODE_CLI"
        return 0
    else
        log_error "KiloCode CLI not found: $KILOCODE_CLI"
        return 1
    fi
}

# Get KiloCode version
# Usage: get_kilocode_version
# Returns: Version string or empty string if not available
get_kilocode_version() {
    if check_kilocode_available; then
        kilo --version 2>/dev/null | head -n1
    else
        echo ""
    fi
}

