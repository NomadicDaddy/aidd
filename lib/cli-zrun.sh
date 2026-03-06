#!/bin/bash
set -euo pipefail
# =============================================================================
# lib/cli-zrun.sh - ZRun CLI Interaction Module for AIDD
# =============================================================================
# Functions for interacting with ZRun (custom z.ai agent), including error detection

# Note: This module is sourced by cli-factory.sh and should not be sourced directly
# Ensure utils.sh is loaded for monitor_coprocess_output function
if ! declare -f monitor_coprocess_output >/dev/null 2>&1; then
    source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
fi

# -----------------------------------------------------------------------------
# ZRun CLI Configuration
# -----------------------------------------------------------------------------
: "${ZRUN_SCRIPT:="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/zrun/src/index.ts"}"

readonly ZRUN_SCRIPT

# -----------------------------------------------------------------------------
# ZRun CLI Interaction Functions
# -----------------------------------------------------------------------------

# Run ZRun prompt with timeout and idle detection
# Usage: run_zrun_prompt <project_dir> <prompt_path> [model_args...]
# Returns: Exit code from ZRun or custom codes (70=no assistant, 71=idle timeout, 72=provider error)
run_zrun_prompt() {
    local project_dir="$1"
    local prompt_path="$2"
    shift 2

    local -a model_args=("$@")

    local zrun_cmd="bun run $ZRUN_SCRIPT"
    if [[ ${#model_args[@]} -gt 0 ]]; then
        zrun_cmd="$zrun_cmd ${model_args[*]}"
    fi

    log_debug "Running ZRun in: $project_dir"
    log_debug "Prompt: $prompt_path"
    log_debug "Script: $ZRUN_SCRIPT"
    log_debug "Timeout: ${TIMEOUT:-$DEFAULT_TIMEOUT}s, Idle: ${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s"

    # Execute ZRun in a coprocess to monitor output
    coproc { (cd "$project_dir" && timeout "${TIMEOUT:-$DEFAULT_TIMEOUT}" bash -c "cat \"\$1\" | $zrun_cmd" _ "$prompt_path") 2>&1; }

    # Use shared monitoring function (with "warn" log level for errors)
    monitor_coprocess_output "warn"
    return $?
}

# Check if ZRun is available
# Usage: check_zrun_available
# Returns: 0 if available, 1 if not
check_zrun_available() {
    # Check bun is available
    if ! command_exists bun; then
        log_error "Bun runtime not found (required for ZRun)"
        return 1
    fi

    # Check zrun script exists
    if [[ ! -f "$ZRUN_SCRIPT" ]]; then
        log_error "ZRun script not found: $ZRUN_SCRIPT"
        return 1
    fi

    # Check node_modules exist
    local zrun_dir
    zrun_dir="$(dirname "$ZRUN_SCRIPT")/.."
    if [[ ! -d "$zrun_dir/node_modules" ]]; then
        log_error "ZRun dependencies not installed. Run: cd $zrun_dir && bun install"
        return 1
    fi

    log_debug "ZRun CLI found"
    return 0
}

# Get ZRun version
# Usage: get_zrun_version
# Returns: Version string
get_zrun_version() {
    local zrun_dir
    zrun_dir="$(dirname "$ZRUN_SCRIPT")/.."
    if [[ -f "$zrun_dir/package.json" ]]; then
        local version
        version=$(jq -r '.version // "unknown"' "$zrun_dir/package.json" 2>/dev/null)
        echo "${version:-unknown}"
    else
        echo "unknown"
    fi
}
