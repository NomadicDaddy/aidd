#!/bin/bash
# =============================================================================
# lib/claude-code-cli.sh - Claude Code CLI Interaction Module for AIDD
# =============================================================================
# Functions for interacting with Claude Code CLI, including error detection

# Note: This module is sourced by cli-factory.sh and should not be sourced directly
# Ensure utils.sh is loaded for monitor_coprocess_output function
if ! declare -f monitor_coprocess_output >/dev/null 2>&1; then
    source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
fi

# -----------------------------------------------------------------------------
# Claude Code CLI Configuration
# -----------------------------------------------------------------------------
: "${CLAUDE_CODE_CLI:="claude"}"
: "${CLAUDE_CODE_NO_SESSION_PERSISTENCE:="--no-session-persistence"}"

readonly CLAUDE_CODE_CLI
readonly CLAUDE_CODE_NO_SESSION_PERSISTENCE

# -----------------------------------------------------------------------------
# Claude Code CLI Interaction Functions
# -----------------------------------------------------------------------------

# Run Claude Code prompt with timeout and idle detection
# Usage: run_claude_code_prompt <project_dir> <prompt_path> [model_args...]
# Returns: Exit code from Claude Code or custom codes (70=no assistant, 71=idle timeout, 72=provider error)
run_claude_code_prompt() {
    local project_dir="$1"
    local prompt_path="$2"
    shift 2

    local -a model_args=("$@")

    # Build Claude Code command
    local claude_cmd="$CLAUDE_CODE_CLI $CLAUDE_CODE_NO_SESSION_PERSISTENCE"
    if [[ ${#model_args[@]} -gt 0 ]]; then
        claude_cmd="$claude_cmd ${model_args[*]}"
    fi

    log_debug "Running Claude Code in: $project_dir"
    log_debug "Prompt: $prompt_path"
    log_debug "Command: $claude_cmd"
    log_debug "Timeout: ${TIMEOUT:-$DEFAULT_TIMEOUT}s, Idle: ${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s"

    # Execute Claude Code in a coprocess to monitor output
    coproc { (cd "$project_dir" && timeout "${TIMEOUT:-$DEFAULT_TIMEOUT}" bash -c "cat \"\$1\" | $claude_cmd" _ "$prompt_path") 2>&1; }

    # Use shared monitoring function (with "warn" log level for errors)
    monitor_coprocess_output "warn"
    return $?
}

# Check if Claude Code is available
# Usage: check_claude_code_available
# Returns: 0 if available, 1 if not
check_claude_code_available() {
    if command_exists "$CLAUDE_CODE_CLI"; then
        log_debug "Claude Code CLI found"
        return 0
    else
        log_error "Claude Code CLI not found"
        log_info "Install Claude Code from: https://claude.com/claude-code"
        return 1
    fi
}

# Get Claude Code version
# Usage: get_claude_code_version
# Returns: Version string or empty string if not available
get_claude_code_version() {
    if command_exists "$CLAUDE_CODE_CLI"; then
        "$CLAUDE_CODE_CLI" --version 2>/dev/null || echo "unknown"
    else
        echo "not installed"
    fi
}
