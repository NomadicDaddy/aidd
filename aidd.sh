#!/usr/bin/env bash

# =============================================================================
# aidd.sh - AI Development Driver
# =============================================================================
# This script orchestrates AI-driven development using OpenCode or KiloCode.
#
# Module Structure:
#   - lib/config.sh: Configuration constants and defaults
#   - lib/utils.sh: Utility functions (logging, file operations)
#   - lib/args.sh: Command-line argument parsing
#   - lib/cli-factory.sh: CLI abstraction factory
#   - lib/opencode-cli.sh: OpenCode CLI interaction functions
#   - lib/kilocode-cli.sh: KiloCode CLI interaction functions
#   - lib/project.sh: Project initialization and management
#   - lib/iteration.sh: Iteration handling and state management
# =============================================================================

# -----------------------------------------------------------------------------
# Source Library Modules
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/lib/config.sh"
source "${SCRIPT_DIR}/lib/utils.sh"
source "${SCRIPT_DIR}/lib/log-cleaner.sh"
source "${SCRIPT_DIR}/lib/log-extractor.sh"
source "${SCRIPT_DIR}/lib/args.sh"

# -----------------------------------------------------------------------------
# System Compatibility Checks
# -----------------------------------------------------------------------------
if ! check_system_compatibility; then
    echo "ERROR: System compatibility checks failed. Please see errors above." >&2
    exit $EXIT_VALIDATION_ERROR
fi

# ---------------------------------------------------------------------------
# ARGUMENT PARSING
# ---------------------------------------------------------------------------
init_args "$@"

# ---------------------------------------------------------------------------
# CLI INITIALIZATION
# ---------------------------------------------------------------------------
# Initialize CLI based on the --cli parameter
source "${SCRIPT_DIR}/lib/cli-factory.sh"
if ! init_cli "$CLI_TYPE"; then
    log_error "Failed to initialize CLI: $CLI_TYPE"
    exit $EXIT_CLI_ERROR
fi

# Check if CLI is available
if ! check_cli_available; then
    log_error "$CLI_NAME is not available. Please install it first."
    exit $EXIT_CLI_ERROR
fi

# Log CLI version information
CLI_VERSION=$(get_cli_version)
if [[ -n "$CLI_VERSION" && "$CLI_VERSION" != "unknown" && "$CLI_VERSION" != "not installed" ]]; then
    log_info "Using CLI: $CLI_NAME ($CLI_TYPE) version $CLI_VERSION"
else
    log_info "Using CLI: $CLI_NAME ($CLI_TYPE)"
    log_warn "Unable to determine $CLI_NAME version"
fi

# Source remaining modules that depend on CLI being initialized
source "${SCRIPT_DIR}/lib/project.sh"
source "${SCRIPT_DIR}/lib/iteration.sh"

# ---------------------------------------------------------------------------
# INITIALIZATION
# ---------------------------------------------------------------------------
# Find or create metadata directory
METADATA_DIR=$(find_or_create_metadata_dir "$PROJECT_DIR")

# Check if spec is required (only for new projects or when metadata dir doesn't have app_spec.txt)
NEEDS_SPEC=false
if [[ ! -d "$PROJECT_DIR" ]] || ! is_existing_codebase "$PROJECT_DIR"; then
    NEEDS_SPEC=true
fi

if [[ "$NEEDS_SPEC" == true && -z "$SPEC_FILE" ]]; then
    log_error "Missing required argument --spec (required for new projects or when app_spec.txt doesn't exist)"
    log_info "Use --help for usage information"
    exit $EXIT_INVALID_ARGS
fi

# Ensure project directory exists (create if missing)
if [[ ! -d "$PROJECT_DIR" ]]; then
    log_info "Project directory '$PROJECT_DIR' does not exist; creating it..."
    mkdir -p "$PROJECT_DIR"
    NEW_PROJECT_CREATED=true

    # Copy scaffolding files to the new project directory (including hidden files)
    log_info "Copying scaffolding files to '$PROJECT_DIR'..."
    if [[ -d "$SCRIPT_DIR/$DEFAULT_SCAFFOLDING_DIR" ]]; then
        for item in "$SCRIPT_DIR/$DEFAULT_SCAFFOLDING_DIR"/*; do
            if [[ -e "$item" ]]; then
                local basename=$(basename "$item")
                if safe_copy "$item" "$PROJECT_DIR/$basename" "$PROJECT_DIR"; then
                    log_debug "Copied scaffolding: $basename"
                else
                    log_warn "Failed to copy scaffolding: $basename"
                fi
            fi
        done
    fi

    # Copy artifacts contents to project's metadata folder
    log_info "Copying templates to '$METADATA_DIR'..."
    mkdir -p "$METADATA_DIR" && chmod 755 "$METADATA_DIR"
    if [[ -d "$SCRIPT_DIR/$DEFAULT_ARTIFACTS_DIR" ]]; then
        for item in "$SCRIPT_DIR/$DEFAULT_ARTIFACTS_DIR"/*; do
            if [[ -e "$item" ]]; then
                local basename=$(basename "$item")
                if safe_copy "$item" "$METADATA_DIR/$basename" "$PROJECT_DIR"; then
                    log_debug "Copied artifact: $basename"
                else
                    log_warn "Failed to copy artifact: $basename"
                fi
            fi
        done
    fi
else
    # Check if this is an existing codebase
    if is_existing_codebase "$PROJECT_DIR"; then
        log_info "Detected existing codebase in '$PROJECT_DIR'"
    fi
fi

# Check if spec file exists (only if provided)
if [[ -n "$SPEC_FILE" && ! -f "$SPEC_FILE" ]]; then
    log_error "Spec file '$SPEC_FILE' does not exist"
    exit $EXIT_NOT_FOUND
fi

# Define the paths to check
SPEC_CHECK_PATH="$METADATA_DIR/$DEFAULT_SPEC_FILE"

# Create iterations directory for transcript logs
ITERATIONS_DIR_FULL="$METADATA_DIR/$DEFAULT_ITERATIONS_DIR"
mkdir -p "$ITERATIONS_DIR_FULL"

# Initialize log index
NEXT_LOG_INDEX="$(get_next_log_index "$ITERATIONS_DIR_FULL")"

# Check onboarding status
check_onboarding_status "$METADATA_DIR"

# Initialize failure counter
CONSECUTIVE_FAILURES=0

log_info "Project directory: $PROJECT_DIR"
log_info "CLI: $CLI_NAME"

# ---------------------------------------------------------------------------
# EXIT HANDLERS
# ---------------------------------------------------------------------------

# Function to clean logs on exit
cleanup_logs() {
    if [[ "$NO_CLEAN" == true ]]; then
        log_info "Skipping log cleanup (--no-clean flag set)"
        return
    fi

    # Use native bash log cleaning (no Node.js required)
    cleanup_iteration_logs "$ITERATIONS_DIR_FULL" --no-backup
}

# Function to handle script exit with proper exit codes
handle_script_exit() {
    local exit_code=$?

    case $exit_code in
        $EXIT_SUCCESS) return ;;  # Success, no message needed
        $EXIT_NO_ASSISTANT) return ;;  # No assistant messages
        $EXIT_IDLE_TIMEOUT) return ;;  # Idle timeout
        $EXIT_PROVIDER_ERROR) return ;;  # Provider error
        $EXIT_SIGNAL_TERMINATED)
            # Don't log error here - handle_failure() already logged whether we're aborting or continuing
            # This trap only runs on final script exit, not on per-iteration timeout
            return 1
            ;;
        130)
            log_error "Invalid configuration or system failure (exit=130)"
            return 1
            ;;
        *)
            log_error "Unknown exit code from CLI (exit=$exit_code)"
            return 1
            ;;
    esac
}

# Set trap to handle script exit with proper exit codes
trap handle_script_exit EXIT
# Set trap to clean logs on script exit (both normal and interrupted)
trap cleanup_logs EXIT

# ---------------------------------------------------------------------------
# MAIN EXECUTION LOOP
# ---------------------------------------------------------------------------

log_info "Starting AI development driver with $CLI_NAME"

# Check for unlimited iterations or fixed count
if [[ -z "$MAX_ITERATIONS" ]]; then
    log_info "Running unlimited iterations (use Ctrl+C to stop)"
    i=1
    while true; do
        printf -v LOG_FILE "%s/%03d.log" "$ITERATIONS_DIR_FULL" "$NEXT_LOG_INDEX"
        NEXT_LOG_INDEX=$((NEXT_LOG_INDEX + 1))

        {
            log_header "Iteration $i"
            log_info "Transcript: $LOG_FILE"
            log_info "Started: $(date -Is 2>/dev/null || date)"
            echo

            # Copy shared directories from copydirs.txt
            copy_shared_directories "$PROJECT_DIR" "$SCRIPT_DIR"

            # Determine which prompt to use based on project state
            PROMPT_INFO=$(determine_prompt "$PROJECT_DIR" "$SCRIPT_DIR" "$METADATA_DIR")
            if [[ $? -ne 0 ]]; then
                log_error "Failed to determine prompt"
                exit $EXIT_GENERAL_ERROR
            fi
            # Validate that the prompt file exists
            PROMPT_PATH="${PROMPT_INFO%|*}"
            PROMPT_TYPE="${PROMPT_INFO#*|}"
            if [[ ! -f "$PROMPT_PATH" ]]; then
                log_error "Prompt file does not exist: $PROMPT_PATH"
                exit $EXIT_GENERAL_ERROR
            fi

            # Copy artifacts if needed (for onboarding/initializer prompts)
            if [[ "$PROMPT_TYPE" != "coding" && "$PROMPT_TYPE" != "directive" ]]; then
                copy_templates "$PROJECT_DIR" "$SCRIPT_DIR"
            fi

            # Copy spec file if this is a new project with spec
            if [[ "$PROMPT_TYPE" == "initializer" && -n "$SPEC_FILE" ]]; then
                cp "$SPEC_FILE" "$SPEC_CHECK_PATH"
            fi

            # Generate status report BEFORE sending prompt
            # This ensures we always have up-to-date status regardless of agent exit code
            log_info "Generating project status before iteration..."
            STATUS_FILE="$METADATA_DIR/status.md"
            mkdir -p "$(dirname "$STATUS_FILE")" 2>/dev/null
            {
                show_status "$PROJECT_DIR"
            } > "$STATUS_FILE" 2>&1
            log_info "Project status saved to: $STATUS_FILE"

            # Check if project is complete BEFORE sending prompt
            # This prevents unnecessary agent invocations when already done
            if check_project_completion "$METADATA_DIR"; then
                log_info "Project completion CONFIRMED. All features pass, thorough review complete."
                exit $EXIT_PROJECT_COMPLETE
            fi

            # Run the appropriate prompt
            log_info "Sending $PROMPT_TYPE prompt to $CLI_NAME..."
            if [[ "$PROMPT_TYPE" == "coding" || "$PROMPT_TYPE" == "directive" ]]; then
                run_cli_prompt "$PROJECT_DIR" "$PROMPT_PATH" "${CODE_MODEL_ARGS[@]}"
            else
                run_cli_prompt "$PROJECT_DIR" "$PROMPT_PATH" "${INIT_MODEL_ARGS[@]}"
            fi

            CLI_EXIT_CODE=$?

            # Clean up directive.md after directive mode completes
            if [[ "$PROMPT_TYPE" == "directive" ]]; then
                rm -f "$METADATA_DIR/directive.md" 2>/dev/null
                log_debug "Removed directive.md"
            fi

            if [[ $CLI_EXIT_CODE -ne 0 ]]; then
                # Handle failure
                handle_failure "$CLI_EXIT_CODE"
            else
                # Reset failure counter on successful iteration
                reset_failure_counter
            fi

            log_info "--- End of iteration $i ---"
            log_info "Finished: $(date -Is 2>/dev/null || date)"
            echo
        } 2>&1 | tee "$LOG_FILE"

        # After iteration block, check if we should continue to next iteration
        # Track handle_failure return status
        HANDLE_FAILURE_RETURN=0
        if [[ $CLI_EXIT_CODE -ne 0 ]]; then
            handle_failure "$CLI_EXIT_CODE"
            HANDLE_FAILURE_RETURN=$?
            # Check if handle_failure wants us to continue
            if [[ $HANDLE_FAILURE_RETURN -eq 0 ]]; then
                # Continue to next iteration - skip rest of this iteration
                continue
            fi
        fi

        # Extract structured log if enabled
        if [[ "$EXTRACT_STRUCTURED" == true ]]; then
            extract_single_log "$LOG_FILE" "$METADATA_DIR"
        fi

        ITERATION_EXIT_CODE=${PIPESTATUS[0]}

        # Handle project completion (exit cleanly with success)
        if [[ $ITERATION_EXIT_CODE -eq $EXIT_PROJECT_COMPLETE ]]; then
            log_info "AI development driver completed: project finished"
            exit $EXIT_SUCCESS
        fi

        # Don't abort on timeout (exit 124) if continue-on-timeout is set
        if [[ $ITERATION_EXIT_CODE -ne 0 ]]; then
            if [[ $ITERATION_EXIT_CODE -eq $EXIT_SIGNAL_TERMINATED && $CONTINUE_ON_TIMEOUT == true ]]; then
                log_warn "Timeout detected on iteration $i, continuing to next iteration..."
            elif [[ $HANDLE_FAILURE_RETURN -ne 0 ]]; then
                # Only exit if handle_failure didn't want us to continue
                exit "$ITERATION_EXIT_CODE"
            fi
        fi

        ((i++))
    done
else
    log_info "Running $MAX_ITERATIONS iterations"
    for ((i=1; i<=MAX_ITERATIONS; i++)); do
        printf -v LOG_FILE "%s/%03d.log" "$ITERATIONS_DIR_FULL" "$NEXT_LOG_INDEX"
        NEXT_LOG_INDEX=$((NEXT_LOG_INDEX + 1))

        {
            log_header "Iteration $i of $MAX_ITERATIONS"
            log_info "Transcript: $LOG_FILE"
            log_info "Started: $(date -Is 2>/dev/null || date)"
            echo

            # Copy shared directories from copydirs.txt
            copy_shared_directories "$PROJECT_DIR" "$SCRIPT_DIR"

            # Determine which prompt to use based on project state
            PROMPT_INFO=$(determine_prompt "$PROJECT_DIR" "$SCRIPT_DIR" "$METADATA_DIR")
            if [[ $? -ne 0 ]]; then
                log_error "Failed to determine prompt"
                exit $EXIT_GENERAL_ERROR
            fi
            # Validate that the prompt file exists
            PROMPT_PATH="${PROMPT_INFO%|*}"
            PROMPT_TYPE="${PROMPT_INFO#*|}"
            if [[ ! -f "$PROMPT_PATH" ]]; then
                log_error "Prompt file does not exist: $PROMPT_PATH"
                exit $EXIT_GENERAL_ERROR
            fi

            # Copy artifacts if needed (for onboarding/initializer prompts)
            if [[ "$PROMPT_TYPE" != "coding" && "$PROMPT_TYPE" != "directive" ]]; then
                copy_templates "$PROJECT_DIR" "$SCRIPT_DIR"
            fi

            # Copy spec file if this is a new project with spec
            if [[ "$PROMPT_TYPE" == "initializer" && -n "$SPEC_FILE" ]]; then
                cp "$SPEC_FILE" "$SPEC_CHECK_PATH"
            fi

            # Generate status report BEFORE sending prompt
            # This ensures we always have up-to-date status regardless of agent exit code
            log_info "Generating project status before iteration..."
            STATUS_FILE="$METADATA_DIR/status.md"
            mkdir -p "$(dirname "$STATUS_FILE")" 2>/dev/null
            {
                show_status "$PROJECT_DIR"
            } > "$STATUS_FILE" 2>&1
            log_info "Project status saved to: $STATUS_FILE"

            # Check if project is complete BEFORE sending prompt
            # This prevents unnecessary agent invocations when already done
            if check_project_completion "$METADATA_DIR"; then
                log_info "Project completion CONFIRMED. All features pass, thorough review complete."
                exit $EXIT_PROJECT_COMPLETE
            fi

            # Run the appropriate prompt
            log_info "Sending $PROMPT_TYPE prompt to $CLI_NAME..."
            if [[ "$PROMPT_TYPE" == "coding" || "$PROMPT_TYPE" == "directive" ]]; then
                run_cli_prompt "$PROJECT_DIR" "$PROMPT_PATH" "${CODE_MODEL_ARGS[@]}"
            else
                run_cli_prompt "$PROJECT_DIR" "$PROMPT_PATH" "${INIT_MODEL_ARGS[@]}"
            fi

            CLI_EXIT_CODE=$?

            # Clean up directive.md after directive mode completes
            if [[ "$PROMPT_TYPE" == "directive" ]]; then
                rm -f "$METADATA_DIR/directive.md" 2>/dev/null
                log_debug "Removed directive.md"
            fi

            if [[ $CLI_EXIT_CODE -ne 0 ]]; then
                # Handle failure
                handle_failure "$CLI_EXIT_CODE"
            else
                # Reset failure counter on successful iteration
                reset_failure_counter
            fi

            # If this is not the last iteration, add a separator
            if [[ $i -lt $MAX_ITERATIONS ]]; then
                log_info "--- End of iteration $i ---"
                log_info "Finished: $(date -Is 2>/dev/null || date)"
                echo
            else
                log_info "Finished: $(date -Is 2>/dev/null || date)"
                echo
            fi
        } 2>&1 | tee "$LOG_FILE"

        # After iteration block, check if we should continue to next iteration
        # Track handle_failure return status
        HANDLE_FAILURE_RETURN=0
        if [[ $CLI_EXIT_CODE -ne 0 ]]; then
            handle_failure "$CLI_EXIT_CODE"
            HANDLE_FAILURE_RETURN=$?
            # Check if handle_failure wants us to continue
            if [[ $HANDLE_FAILURE_RETURN -eq 0 ]]; then
                # Continue to next iteration
                continue
            fi
        fi

        # Extract structured log if enabled
        if [[ "$EXTRACT_STRUCTURED" == true ]]; then
            extract_single_log "$LOG_FILE" "$METADATA_DIR"
        fi

        ITERATION_EXIT_CODE=${PIPESTATUS[0]}
        # Handle project completion (exit cleanly with success)
        if [[ $ITERATION_EXIT_CODE -eq $EXIT_PROJECT_COMPLETE ]]; then
            log_info "AI development driver completed: project finished"
            exit $EXIT_SUCCESS
        fi
        # Don't abort on timeout (exit 124) if continue-on-timeout is set
        if [[ $ITERATION_EXIT_CODE -ne 0 ]]; then
            if [[ $ITERATION_EXIT_CODE -eq $EXIT_SIGNAL_TERMINATED && $CONTINUE_ON_TIMEOUT == true ]]; then
                log_warn "Timeout detected on iteration $i, continuing to next iteration..."
            elif [[ $HANDLE_FAILURE_RETURN -ne 0 ]]; then
                # Only exit if handle_failure didn't want us to continue
                exit "$ITERATION_EXIT_CODE"
            fi
        fi
    done
fi

log_info "AI development driver completed successfully"
exit $EXIT_SUCCESS
