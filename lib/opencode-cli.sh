#!/bin/bash
# =============================================================================
# lib/opencode-cli.sh - OpenCode CLI Interaction Module for AIDD
# =============================================================================
# Functions for interacting with OpenCode CLI, including error detection

# Note: This module is sourced by cli-factory.sh and should not be sourced directly
# Config and utils are assumed to be already loaded by cli-factory.sh

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
    local saw_no_assistant=false
    local saw_idle_timeout=false
    local saw_provider_error=false

    local opencode_cmd="opencode run"
    if [[ ${#model_args[@]} -gt 0 ]]; then
        opencode_cmd="$opencode_cmd ${model_args[*]}"
    fi

    log_debug "Running OpenCode in: $project_dir"
    log_debug "Prompt: $prompt_path"
    log_debug "Timeout: ${TIMEOUT:-$DEFAULT_TIMEOUT}s, Idle: ${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s"

    # Execute OpenCode in a coprocess to monitor output
    coproc OPENCODE_PROC { (cd "$project_dir" && timeout "${TIMEOUT:-$DEFAULT_TIMEOUT}" bash -c "cat '$prompt_path' | $opencode_cmd") 2>&1; }

    # Monitor output for error patterns and idle timeout
    while true; do
        local line=""
        if IFS= read -r -t "${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}" line <&"${OPENCODE_PROC[0]}"; then
            echo "$line"

            # Check for "no assistant messages" pattern
            if [[ "$line" == *"$PATTERN_NO_ASSISTANT"* ]]; then
                saw_no_assistant=true
                log_warn "Detected 'no assistant messages' from model"
                kill -TERM "$OPENCODE_PROC_PID" 2>/dev/null || true
                break
            fi

            # Check for provider error pattern
            if [[ "$line" == *"$PATTERN_PROVIDER_ERROR"* ]]; then
                saw_provider_error=true
                log_warn "Detected 'provider error' from model"
                kill -TERM "$OPENCODE_PROC_PID" 2>/dev/null || true
                break
            fi

            continue
        fi

        # Check if process is still running (idle timeout)
        if kill -0 "$OPENCODE_PROC_PID" 2>/dev/null; then
            saw_idle_timeout=true
            log_warn "Idle timeout (${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s) waiting for OpenCode output"
            kill -TERM "$OPENCODE_PROC_PID" 2>/dev/null || true
            break
        fi

        # Process has finished
        break
    done

    # Wait for process to finish and get exit code
    wait "$OPENCODE_PROC_PID" 2>/dev/null
    local exit_code=$?

    # Return custom exit codes based on detected conditions
    if [[ "$saw_no_assistant" == true ]]; then
        log_debug "Exiting with NO_ASSISTANT code: $EXIT_NO_ASSISTANT"
        return "$EXIT_NO_ASSISTANT"
    fi

    if [[ "$saw_idle_timeout" == true ]]; then
        log_debug "Exiting with IDLE_TIMEOUT code: $EXIT_IDLE_TIMEOUT"
        return "$EXIT_IDLE_TIMEOUT"
    fi

    if [[ "$saw_provider_error" == true ]]; then
        log_debug "Exiting with PROVIDER_ERROR code: $EXIT_PROVIDER_ERROR"
        return "$EXIT_PROVIDER_ERROR"
    fi

    log_debug "Exiting with OpenCode exit code: $exit_code"
    return "$exit_code"
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

