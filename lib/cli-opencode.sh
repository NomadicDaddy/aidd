#!/bin/bash
set -euo pipefail
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
# OpenCode CLI Configuration
# -----------------------------------------------------------------------------
: "${OPENCODE_CONFIG_FILE:="opencode.json"}"

readonly OPENCODE_CONFIG_FILE

# -----------------------------------------------------------------------------
# OpenCode Permission Configuration
# -----------------------------------------------------------------------------

# Ensure opencode.json exists with permissive settings to prevent blocking prompts
# Unlike Claude Code (--dangerously-skip-permissions flag), OpenCode uses config files
# Usage: ensure_opencode_config <project_dir>
# Returns: 0 on success, 1 on failure
ensure_opencode_config() {
    local project_dir="$1"
    local config_path="$project_dir/$OPENCODE_CONFIG_FILE"

    # Define the permissive config (all permissions allowed, no prompts)
    local permissive_config='{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "allow"
  }
}'

    if [[ -f "$config_path" ]]; then
        # Config exists - check if it has permissive settings
        if command -v jq >/dev/null 2>&1; then
            local current_permission
            current_permission=$(jq -r '.permission // empty' "$config_path" 2>/dev/null)

            if [[ -n "$current_permission" ]]; then
                # Check if already permissive (either "*": "allow" or direct "allow")
                local global_perm
                global_perm=$(jq -r '.permission["*"] // .permission // empty' "$config_path" 2>/dev/null)

                if [[ "$global_perm" == "allow" ]]; then
                    log_debug "OpenCode config already permissive: $config_path"
                    return 0
                fi
            fi

            # Merge permissive settings into existing config
            log_info "Updating OpenCode config with permissive permissions: $config_path"
            local merged
            merged=$(jq '.permission = {"*": "allow"}' "$config_path" 2>/dev/null)
            if [[ -n "$merged" ]]; then
                echo "$merged" > "$config_path"
                return 0
            fi
        fi

        # jq not available or merge failed - warn but don't overwrite
        log_warn "OpenCode config exists but cannot verify permissions (jq unavailable): $config_path"
        log_warn "Ensure 'permission: {\"*\": \"allow\"}' is set to prevent blocking prompts"
        return 0
    fi

    # Config doesn't exist - create it
    log_info "Creating permissive OpenCode config: $config_path"
    echo "$permissive_config" > "$config_path"

    if [[ -f "$config_path" ]]; then
        log_debug "OpenCode config created successfully"
        return 0
    else
        log_error "Failed to create OpenCode config: $config_path"
        return 1
    fi
}

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

    # Ensure permissive OpenCode config exists to prevent blocking permission prompts
    ensure_opencode_config "$project_dir"

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
