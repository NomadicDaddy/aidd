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
export ITERATIONS_DIR=""
export METADATA_DIR=""
export SPEC_CHECK_PATH=""
export FEATURE_LIST_CHECK_PATH=""

# Note: ITERATIONS_DIR and METADATA_DIR are not marked readonly
# because they are assigned values at runtime in init_iterations()

# -----------------------------------------------------------------------------
# Phase and State Constants
# -----------------------------------------------------------------------------
: "${PHASE_ONBOARDING:="onboarding"}"
: "${PHASE_INITIALIZER:="initializer"}"
: "${PHASE_CODING:="coding"}"

readonly PHASE_ONBOARDING
readonly PHASE_INITIALIZER
readonly PHASE_CODING

: "${STATE_NEW:="new"}"
: "${STATE_IN_PROGRESS:="in_progress"}"
: "${STATE_COMPLETE:="complete"}"
: "${STATE_FAILED:="failed"}"

readonly STATE_NEW
readonly STATE_IN_PROGRESS
readonly STATE_COMPLETE
readonly STATE_FAILED

# -----------------------------------------------------------------------------
# Iteration Initialization Functions
# -----------------------------------------------------------------------------

# Initialize iterations
# Usage: init_iterations <project_dir>
# Returns: 0 on success
init_iterations() {
    local project_dir="$1"
    
    # Get metadata directory
    METADATA_DIR=$(find_or_create_metadata_dir "$project_dir")
    
    # Set up iterations directory
    ITERATIONS_DIR="$METADATA_DIR/$ITERATIONS_DIR"
    ensure_dir "$ITERATIONS_DIR"
    
    # Set up check paths
    SPEC_CHECK_PATH="$METADATA_DIR/$SPEC_FILE_NAME"
    FEATURE_LIST_CHECK_PATH="$METADATA_DIR/$FEATURE_LIST_FILE"
    
    # Get next log index
    NEXT_LOG_INDEX=$(get_next_log_index)
    
    # Reset iteration state
    ITERATION_NUMBER=0
    CONSECUTIVE_FAILURES=0
    
    log_debug "Initialized iterations: $ITERATIONS_DIR"
    log_debug "Next log index: $NEXT_LOG_INDEX"
    
    return 0
}

# Start iteration
# Usage: start_iteration <iteration_num>
# Returns: 0 on success
start_iteration() {
    local iteration_num="$1"
    
    ITERATION_NUMBER=$iteration_num
    log_info "Starting iteration $iteration_num"
    
    return 0
}

# End iteration
# Usage: end_iteration <iteration_num> <success>
# Returns: 0 on success
end_iteration() {
    local iteration_num="$1"
    local success="$2"
    
    if [[ "$success" == "true" ]]; then
        log_info "Iteration $iteration_num completed successfully"
    else
        log_warn "Iteration $iteration_num failed"
    fi
    
    return 0
}

# Check if should continue iterations
# Usage: should_continue <max_iterations>
# Returns: 0 if should continue, 1 if should stop
should_continue() {
    local max_iterations="$1"
    
    # If unlimited iterations, always continue
    if [[ -z "$max_iterations" ]]; then
        return 0
    fi
    
    # Check if we've reached max iterations
    if [[ $ITERATION_NUMBER -ge $max_iterations ]]; then
        log_info "Reached maximum iterations: $max_iterations"
        return 1
    fi
    
    return 0
}

# Handle failure
# Usage: handle_failure <exit_code>
# Returns: 0 if should continue, exits if should quit
handle_failure() {
    local exit_code="$1"

    # Don't count timeout (exit 124) as a failure if CONTINUE_ON_TIMEOUT is set
    if [[ $exit_code -eq 124 && $CONTINUE_ON_TIMEOUT == true ]]; then
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
    log_warn "KiloCode failed (exit=$exit_code); this is failure #$CONSECUTIVE_FAILURES"

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
# Usage: check_onboarding_status
# Returns: 0 if onboarding complete, 1 if incomplete
check_onboarding_status() {
    # Check if feature_list.json exists
    if [[ ! -f "$FEATURE_LIST_CHECK_PATH" ]]; then
        return 1
    fi
    
    # Check if feature_list.json contains actual data (not just template)
    if grep -q "$TEMPLATE_DATE_MARKER" "$FEATURE_LIST_CHECK_PATH" || \
       grep -q "$TEMPLATE_FEATURE_MARKER" "$FEATURE_LIST_CHECK_PATH"; then
        return 1
    fi
    
    return 0
}

# -----------------------------------------------------------------------------
# Prompt Determination Functions
# -----------------------------------------------------------------------------

# Determine which prompt to use
# Usage: determine_prompt <new_project_created> <script_dir>
# Returns: Path to prompt file and phase name (via stdout)
determine_prompt() {
    local new_project_created="$1"
    local script_dir="$2"
    local prompt_path=""
    local phase=""
    local todo_check_path="$METADATA_DIR/todo.md"
    
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
    if check_onboarding_status; then
        # Onboarding complete, use coding prompt
        prompt_path="$script_dir/prompts/coding.md"
        phase="$PHASE_CODING"
        echo "$prompt_path|$phase"
        return 0
    fi
    
    # Check if this is an existing codebase
    if [[ "$new_project_created" == false ]] && is_existing_codebase "$PROJECT_DIR"; then
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
# Usage: get_next_log_index
# Returns: Next available log index
get_next_log_index() {
    local max=0
    local f base num
    
    shopt -s nullglob
    for f in "$ITERATIONS_DIR"/*.log; do
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

# -----------------------------------------------------------------------------
# Iteration Cycle Functions
# -----------------------------------------------------------------------------

# Run a single iteration
# Usage: run_iteration <iteration_num> <max_iterations> <script_dir>
# Returns: Exit code from KiloCode
run_iteration() {
    local iteration_num="$1"
    local max_iterations="$2"
    local script_dir="$3"
    local log_file=""
    local prompt_info=""
    local prompt_path=""
    local phase=""
    local model_args=()
    local cli_exit_code=0
    local iteration_exit_code=0
    
    # Start iteration
    start_iteration "$iteration_num"
    
    # Create log file path
    printf -v log_file "%s/%03d.log" "$ITERATIONS_DIR" "$NEXT_LOG_INDEX"
    NEXT_LOG_INDEX=$((NEXT_LOG_INDEX + 1))
    
    # Determine prompt to use
    prompt_info=$(determine_prompt "$NEW_PROJECT_CREATED" "$script_dir")
    prompt_path="${prompt_info%|*}"
    phase="${prompt_info#*|}"
    
    # Select model args based on phase
    if [[ "$phase" == "$PHASE_CODING" ]]; then
        model_args=("${CODE_MODEL_ARGS[@]}")
    else
        model_args=("${INIT_MODEL_ARGS[@]}")
    fi
    
    # Print iteration header
    {
        echo "Iteration $iteration_num"
        if [[ -n "$max_iterations" ]]; then
            echo "Iteration $iteration_num of $max_iterations"
        fi
        echo "Transcript: $log_file"
        echo "Started: $(date -Is 2>/dev/null || date)"
        echo ""
        
        # Handle prompt selection and artifact copying
        if [[ "$phase" == "$PHASE_CODING" ]]; then
            echo "Required files found, sending coding prompt..."
            run_cli_prompt "$PROJECT_DIR" "$prompt_path" "${model_args[@]}"
        elif [[ "$phase" == "$PHASE_ONBOARDING" ]]; then
            if [[ "$ONBOARDING_COMPLETE" == false ]]; then
                echo "Detected incomplete onboarding, resuming onboarding prompt..."
            else
                echo "Detected existing codebase, using onboarding prompt..."
            fi
            copy_artifacts "$PROJECT_DIR" "$script_dir"
            run_cli_prompt "$PROJECT_DIR" "$prompt_path" "${model_args[@]}"
        else
            echo "Required files not found, copying spec and sending initializer prompt..."
            copy_artifacts "$PROJECT_DIR" "$script_dir"
            if [[ -n "$SPEC_FILE" ]]; then
                cp "$SPEC_FILE" "$SPEC_CHECK_PATH"
            fi
            run_cli_prompt "$PROJECT_DIR" "$prompt_path" "${model_args[@]}"
        fi
        
        cli_exit_code=$?
        
        # Handle failure or success
        if [[ $cli_exit_code -ne 0 ]]; then
            handle_failure "$cli_exit_code"
        else
            reset_failure_counter
        fi
        
        # Print iteration footer
        echo ""
        echo "--- End of iteration $iteration_num ---"
        echo "Finished: $(date -Is 2>/dev/null || date)"
        echo ""
    } 2>&1 | tee "$log_file"
    
    iteration_exit_code=${PIPESTATUS[0]}
    
    # End iteration
    if [[ $iteration_exit_code -eq 0 ]]; then
        end_iteration "$iteration_num" "true"
    else
        end_iteration "$iteration_num" "false"
    fi
    
    return "$iteration_exit_code"
}

# Run iteration cycle (main loop)
# Usage: run_iteration_cycle <max_iterations> <script_dir>
# Returns: Exit code from last failed iteration
run_iteration_cycle() {
    local max_iterations="$1"
    local script_dir="$2"
    local iteration_num=1
    local exit_code=0
    
    # Check for onboarding status
    ONBOARDING_COMPLETE=false
    if check_onboarding_status; then
        ONBOARDING_COMPLETE=true
    fi
    
    # Run iterations
    if [[ -z "$max_iterations" ]]; then
        log_info "Running unlimited iterations (use Ctrl+C to stop)"
        
        while true; do
            run_iteration "$iteration_num" "" "$script_dir"
            exit_code=$?
            
            # Don't abort on timeout (exit 124) if CONTINUE_ON_TIMEOUT is set
            if [[ $exit_code -ne 0 ]]; then
                if [[ $exit_code -eq 124 && $CONTINUE_ON_TIMEOUT == true ]]; then
                    log_warn "Timeout detected on iteration $iteration_num, continuing to next iteration..."
                else
                    exit "$exit_code"
                fi
            fi
            
            ((iteration_num++))
        done
    else
        log_info "Running $max_iterations iterations"
        
        for ((iteration_num=1; iteration_num<=max_iterations; iteration_num++)); do
            run_iteration "$iteration_num" "$max_iterations" "$script_dir"
            exit_code=$?
            
            # Don't abort on timeout (exit 124) if CONTINUE_ON_TIMEOUT is set
            if [[ $exit_code -ne 0 ]]; then
                if [[ $exit_code -eq 124 && $CONTINUE_ON_TIMEOUT == true ]]; then
                    log_warn "Timeout detected on iteration $iteration_num, continuing to next iteration..."
                else
                    exit "$exit_code"
                fi
            fi
        done
    fi
    
    return 0
}

# -----------------------------------------------------------------------------
# State Management Functions
# -----------------------------------------------------------------------------

# Save iteration state
# Usage: save_iteration_state <state_file>
# Returns: 0 on success
save_iteration_state() {
    local state_file="$1"
    
    cat > "$state_file" << EOF
ITERATION_NUMBER=$ITERATION_NUMBER
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
NEXT_LOG_INDEX=$NEXT_LOG_INDEX
EOF
    
    log_debug "Saved iteration state to $state_file"
    return 0
}

# Load iteration state
# Usage: load_iteration_state <state_file>
# Returns: 0 on success, 1 if state file doesn't exist
load_iteration_state() {
    local state_file="$1"
    
    if [[ ! -f "$state_file" ]]; then
        log_debug "No iteration state file found: $state_file"
        return 1
    fi
    
    # Source the state file
    source "$state_file"
    
    log_debug "Loaded iteration state from $state_file"
    return 0
}

# Reset iteration state
# Usage: reset_iteration_state
# Returns: 0 on success
reset_iteration_state() {
    ITERATION_NUMBER=0
    CONSECUTIVE_FAILURES=0
    NEXT_LOG_INDEX=$(get_next_log_index)
    
    log_debug "Reset iteration state"
    return 0
}

# -----------------------------------------------------------------------------
# Progress Tracking Functions
# -----------------------------------------------------------------------------

# Get iteration progress
# Usage: get_iteration_progress <max_iterations>
# Returns: Progress percentage (0-100)
get_iteration_progress() {
    local max_iterations="$1"
    
    if [[ -z "$max_iterations" ]] || [[ $max_iterations -eq 0 ]]; then
        echo 0
        return 0
    fi
    
    local progress=$((ITERATION_NUMBER * 100 / max_iterations))
    
    if [[ $progress -gt 100 ]]; then
        echo 100
    else
        echo "$progress"
    fi
}

# Print iteration summary
# Usage: print_iteration_summary <max_iterations>
# Returns: 0 on success
print_iteration_summary() {
    local max_iterations="$1"
    
    echo ""
    echo "Iteration Summary:"
    echo "  Total iterations: $ITERATION_NUMBER"
    
    if [[ -n "$max_iterations" ]]; then
        local progress
        progress=$(get_iteration_progress "$max_iterations")
        echo "  Progress: $progress%"
    fi
    
    echo "  Consecutive failures: $CONSECUTIVE_FAILURES"
    echo ""
    
    return 0
}

# -----------------------------------------------------------------------------
# Log Cleanup Functions
# -----------------------------------------------------------------------------

# Cleanup logs on exit
# Usage: cleanup_logs <script_dir>
# Returns: 0 on success
cleanup_logs() {
    local script_dir="$1"
    
    if [[ "$NO_CLEAN" == true ]]; then
        log_info "Skipping log cleanup (--no-clean flag set)"
        return 0
    fi
    
    log_info "Cleaning iteration logs..."
    
    if [[ -d "$ITERATIONS_DIR" ]] && [[ -n "$(ls -A "$ITERATIONS_DIR" 2>/dev/null)" ]]; then
        node "$script_dir/clean-logs.js" "$ITERATIONS_DIR" --no-backup
        log_info "Log cleanup complete"
    fi
    
    return 0
}
