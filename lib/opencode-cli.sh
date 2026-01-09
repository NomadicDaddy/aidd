#!/bin/bash
# =============================================================================
# lib/opencode-cli.sh - OpenCode CLI Interaction Module for AIDD
# =============================================================================
# Functions for interacting with OpenCode CLI, including error detection

# Note: This module is sourced by cli-factory.sh and should not be sourced directly
# Ensure utils.sh is loaded for monitor_coprocess_output function
if ! declare -f monitor_coprocess_output >/dev/null 2>&1; then
    source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
fi

# -----------------------------------------------------------------------------
# OpenCode CLI Interaction Functions
# -----------------------------------------------------------------------------

# Run OpenCode prompt with timeout and idle detection
# Usage: run_opencode_prompt <project_dir> <prompt_path> [model_args...]
# Returns: Exit code from OpenCode or custom codes (70=no assistant, 71=idle timeout, 72=provider error)
run_opencode_prompt() {
    local project_dir="$1"
    local prompt_path="$2"
    shift 2

    local -a model_args=("$@")

    local opencode_cmd="opencode run"
    if [[ ${#model_args[@]} -gt 0 ]]; then
        opencode_cmd="$opencode_cmd ${model_args[*]}"
    fi

    log_debug "Running OpenCode in: $project_dir"
    log_debug "Prompt: $prompt_path"
    log_debug "Timeout: ${TIMEOUT:-$DEFAULT_TIMEOUT}s, Idle: ${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s"

    # Execute OpenCode in a coprocess to monitor output
    coproc { (cd "$project_dir" && timeout "${TIMEOUT:-$DEFAULT_TIMEOUT}" bash -c "cat \"\$1\" | $opencode_cmd" _ "$prompt_path") 2>&1; }

    # Use shared monitoring function (with "warn" log level for errors)
    monitor_coprocess_output "warn"
    return $?
}

# Check if OpenCode is available
# Usage: check_opencode_available
# Returns: 0 if available, 1 if not
check_opencode_available() {
    if command_exists opencode; then
        log_debug "OpenCode CLI found"
        return 0
    else
        log_error "OpenCode CLI not found"
        return 1
    fi
}

# Get OpenCode version
# Usage: get_opencode_version
# Returns: Version string or empty string if not available
get_opencode_version() {
    if command_exists opencode; then
        opencode --version 2>/dev/null || echo "unknown"
    else
        echo "not installed"
    fi
}

