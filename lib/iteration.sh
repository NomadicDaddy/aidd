#!/bin/bash
# =============================================================================
# lib/iteration.sh - Iteration Handling Module for AIDD
# =============================================================================
# Functions for managing iterations, state, and failure handling

# Source configuration, utilities, and project modules
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
source "$(dirname "${BASH_SOURCE[0]}")/project.sh"

# -----------------------------------------------------------------------------
# Iteration State Variables
# -----------------------------------------------------------------------------
export ITERATION_NUMBER=0
export CONSECUTIVE_FAILURES=0
export NEXT_LOG_INDEX=0

# -----------------------------------------------------------------------------
# Phase Constants
# -----------------------------------------------------------------------------
: "${PHASE_ONBOARDING:="onboarding"}"
: "${PHASE_INITIALIZER:="initializer"}"
: "${PHASE_CODING:="coding"}"

readonly PHASE_ONBOARDING
readonly PHASE_INITIALIZER
readonly PHASE_CODING

# -----------------------------------------------------------------------------
# Failure Handling Functions
# -----------------------------------------------------------------------------

# Handle failure
# Usage: handle_failure <exit_code>
# Returns: 0 if should continue, exits if should quit
handle_failure() {
    local exit_code="$1"

    # Don't count timeout (exit 124) as a failure if CONTINUE_ON_TIMEOUT is set
    if [[ $exit_code -eq $EXIT_SIGNAL_TERMINATED && $CONTINUE_ON_TIMEOUT == true ]]; then
        log_warn "Timeout detected (exit=$exit_code), continuing to next iteration..."
        # Increment failure counter to track repeated timeouts
        ((CONSECUTIVE_FAILURES++))
        log_error "Timeout #$CONSECUTIVE_FAILURES (exit=$exit_code)"
        # Check if we should quit due to repeated timeouts
        if [[ $QUIT_ON_ABORT -gt 0 && $CONSECUTIVE_FAILURES -ge $QUIT_ON_ABORT ]]; then
            log_error "Reached failure threshold ($QUIT_ON_ABORT) due to repeated timeouts; quitting."
            exit "$exit_code"
        fi
        return 0
    fi

    # Increment failure counter
    ((CONSECUTIVE_FAILURES++))
    log_warn "$CLI_NAME failed (exit=$exit_code); this is failure #$CONSECUTIVE_FAILURES"

    # Check if we should quit or continue
    if [[ $QUIT_ON_ABORT -gt 0 && $CONSECUTIVE_FAILURES -ge $QUIT_ON_ABORT ]]; then
        log_error "Reached failure threshold ($QUIT_ON_ABORT); quitting."
        exit "$exit_code"
    else
        log_info "Continuing to next iteration (threshold: $QUIT_ON_ABORT)"
    fi

    return 0
}

# Reset failure counter
# Usage: reset_failure_counter
# Returns: 0 on success
reset_failure_counter() {
    CONSECUTIVE_FAILURES=0
    log_debug "Failure counter reset"
    return 0
}

# -----------------------------------------------------------------------------
# Onboarding Status Functions
# -----------------------------------------------------------------------------

# Check onboarding status
# Usage: check_onboarding_status <feature_list_path>
# Returns: 0 if onboarding complete, 1 if incomplete
check_onboarding_status() {
    local feature_list_path="$1"

    # Check if feature_list.json exists
    if [[ ! -f "$feature_list_path" ]]; then
        return 1
    fi

    # Check if feature_list.json contains actual data (not just template)
    if grep -q "$TEMPLATE_DATE_MARKER" "$feature_list_path" || \
       grep -q "$TEMPLATE_FEATURE_MARKER" "$feature_list_path"; then
        return 1
    fi

    return 0
}

# -----------------------------------------------------------------------------
# Prompt Determination Functions
# -----------------------------------------------------------------------------

# Determine which prompt to use
# Usage: determine_prompt <project_dir> <script_dir> <metadata_dir>
# Returns: Path to prompt file and phase name (via stdout)
determine_prompt() {
    local project_dir="$1"
    local script_dir="$2"
    local metadata_dir="$3"
    local prompt_path=""
    local phase=""
    local todo_check_path="$metadata_dir/todo.md"
    local feature_list_path="$metadata_dir/${DEFAULT_FEATURE_LIST_FILE}"

    # Check for TODO mode first
    if [[ "$TODO_MODE" == true ]]; then
        # Check if todo.md exists
        if [[ -f "$todo_check_path" ]]; then
            log_info "Using todo.md to complete existing work items"
            prompt_path="$script_dir/prompts/todo.md"
            phase="$PHASE_CODING"
            echo "$prompt_path|$phase"
            return 0
        else
            log_error "No todo.md found in project directory"
            return 1
        fi
    fi

    # Check if onboarding is complete
    if check_onboarding_status "$feature_list_path"; then
        # Onboarding complete, use coding prompt
        prompt_path="$script_dir/prompts/coding.md"
        phase="$PHASE_CODING"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check if this is an existing codebase
    if is_existing_codebase "$project_dir"; then
        # Existing codebase, use onboarding prompt
        prompt_path="$script_dir/prompts/onboarding.md"
        phase="$PHASE_ONBOARDING"
        echo "$prompt_path|$phase"
        return 0
    fi

    # New project or incomplete onboarding, use initializer prompt
    prompt_path="$script_dir/prompts/initializer.md"
    phase="$PHASE_INITIALIZER"
    echo "$prompt_path|$phase"
    return 0
}

# -----------------------------------------------------------------------------
# Log Management Functions
# -----------------------------------------------------------------------------

# Get next log index
# Usage: get_next_log_index <iterations_dir>
# Returns: Next available log index
get_next_log_index() {
    local iterations_dir="$1"
    local max=0
    local f base num

    shopt -s nullglob
    for f in "$iterations_dir"/*.log; do
        base="$(basename "${f%.log}")"
        if [[ "$base" =~ ^[0-9]+$ ]]; then
            num=$((10#$base))
            if (( num > max )); then
                max=$num
            fi
        fi
    done
    shopt -u nullglob

    echo $((max + 1))
}
