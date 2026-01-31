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
# HANDLE --stop FLAG (early exit, no CLI needed)
# ---------------------------------------------------------------------------
if [[ "$STOP_SIGNAL" == true ]]; then
    if [[ -z "$PROJECT_DIR" ]]; then
        echo "Error: --stop requires --project-dir" >&2
        exit $EXIT_INVALID_ARGS
    fi
    stop_file="$PROJECT_DIR/.automaker/.stop"
    mkdir -p "$(dirname "$stop_file")" 2>/dev/null
    echo "$(date -Is 2>/dev/null || date)" > "$stop_file"
    echo "Stop signal created: $stop_file"
    echo "Running AIDD instance will stop after current iteration completes."
    exit $EXIT_SUCCESS
fi

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
# Audit mode skips spec requirement - audits run against existing codebases
NEEDS_SPEC=false
if [[ "$AUDIT_MODE" != "true" ]]; then
    if [[ ! -d "$PROJECT_DIR" ]] || ! is_existing_codebase "$PROJECT_DIR"; then
        NEEDS_SPEC=true
    fi
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

# Clean up stale stop file from previous run (prevents accidental immediate exit)
if [[ -f "$METADATA_DIR/.stop" ]]; then
    log_warn "Removing stale .stop file from previous run"
    rm -f "$METADATA_DIR/.stop" 2>/dev/null
fi

# ---------------------------------------------------------------------------
# Multi-Audit Loop (runs once if not in audit mode or single audit)
# ---------------------------------------------------------------------------
run_single_audit_or_all() {
    local current_audit="$1"
    local audit_num="$2"
    local total_audits="$3"

    # Set AUDIT_NAME for this iteration
    if [[ -n "$current_audit" ]]; then
        AUDIT_NAME="$current_audit"
        export AUDIT_NAME
        if [[ $total_audits -gt 1 ]]; then
            log_header "AUDIT $audit_num of $total_audits: $AUDIT_NAME"
        fi
    fi

    # Check for unlimited iterations or fixed count
    if [[ -z "$MAX_ITERATIONS" ]]; then
    log_info "Running unlimited iterations (use Ctrl+C to stop)"
    i=1
    local consecutive_no_change=0
    local MAX_NO_CHANGE_ITERATIONS=3
    while true; do
        printf -v LOG_FILE "%s/%03d.log" "$ITERATIONS_DIR_FULL" "$NEXT_LOG_INDEX"
        NEXT_LOG_INDEX=$((NEXT_LOG_INDEX + 1))

        # Capture git state before iteration for stuck detection
        local pre_iteration_head=""
        local pre_iteration_dirty=""
        if command -v git >/dev/null 2>&1 && git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
            pre_iteration_head=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
            pre_iteration_dirty=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null || echo "")
        fi

        # Check project completion BEFORE entering subshell (exit inside subshell doesn't work)
        # Phase 1: Creates .project_completion_pending, returns 1 (continue to TODO review)
        # Phase 2: Pending file exists + still complete, returns 0 (confirmed complete)
        # Skip for audit mode - audits should always run regardless of completion
        if [[ "$AUDIT_MODE" != "true" ]] && check_project_completion "$METADATA_DIR"; then
            log_info "Project completion CONFIRMED. All features pass, thorough review complete."
            # Extract structured log for this empty iteration
            if [[ "$EXTRACT_STRUCTURED" == true ]]; then
                echo "[INFO] Project completion CONFIRMED. All features pass, thorough review complete." > "$LOG_FILE"
                extract_single_log "$LOG_FILE" "$METADATA_DIR"
            fi
            exit $EXIT_PROJECT_COMPLETE
        fi

        {
            # Determine which prompt to use based on project state (needed for header)
            # Will see .project_completion_pending if Phase 1 was triggered above
            PROMPT_INFO=$(determine_prompt "$PROJECT_DIR" "$SCRIPT_DIR" "$METADATA_DIR")
            if [[ $? -ne 0 ]]; then
                log_error "Failed to determine prompt"
                exit $EXIT_GENERAL_ERROR
            fi
            PROMPT_PATH="${PROMPT_INFO%|*}"
            PROMPT_TYPE="${PROMPT_INFO#*|}"

            # Print comprehensive iteration header
            log_iteration_header "$i" "" "$LOG_FILE"

            # Copy shared directories from copydirs.txt
            copy_shared_directories "$PROJECT_DIR" "$SCRIPT_DIR"

            # Copy shared files from copyfiles.txt
            copy_shared_files "$PROJECT_DIR" "$SCRIPT_DIR"

            # Validate that the prompt file exists
            if [[ ! -f "$PROMPT_PATH" ]]; then
                log_error "Prompt file does not exist: $PROMPT_PATH"
                exit $EXIT_GENERAL_ERROR
            fi

            # Copy artifacts if needed (for onboarding/initializer prompts)
            if [[ "$PROMPT_TYPE" != "coding" && "$PROMPT_TYPE" != "directive" && "$PROMPT_TYPE" != "audit" ]]; then
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

            # Check if current mode should stop early (TODO/in-progress with no items)
            # This prevents unnecessary agent invocations when mode-specific work is done
            if should_stop_current_mode "$METADATA_DIR"; then
                log_info "Mode-specific work complete. Stopping early due to --stop-when-done flag."
                exit $EXIT_SUCCESS
            fi

            # Run the appropriate prompt
            prompt_name=$(basename "$PROMPT_PATH" .md)
            log_info "Sending $prompt_name prompt to $CLI_NAME..."
            if [[ "$PROMPT_TYPE" == "coding" || "$PROMPT_TYPE" == "directive" || "$PROMPT_TYPE" == "audit" ]]; then
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

            # Clean up audit-prompt.md after audit mode completes
            if [[ "$PROMPT_TYPE" == "audit" ]]; then
                rm -f "$METADATA_DIR/audit-prompt.md" 2>/dev/null
                log_debug "Removed audit-prompt.md"
            fi

            # Save CLI exit code to file so parent shell can read it
            # (variables set inside { ... } | tee subshell don't propagate)
            echo "$CLI_EXIT_CODE" > "$LOG_FILE.exitcode"

            log_info "--- End of iteration $i ---"
            log_info "Finished: $(date -Is 2>/dev/null || date)"
            echo
        } 2>&1 | tee "$LOG_FILE"

        # Read CLI exit code from file (subshell variables don't propagate through pipe)
        CLI_EXIT_CODE=$(cat "$LOG_FILE.exitcode" 2>/dev/null || echo "0")
        rm -f "$LOG_FILE.exitcode" 2>/dev/null

        # Handle failure or reset counter based on CLI exit code
        HANDLE_FAILURE_RETURN=0
        if [[ $CLI_EXIT_CODE -ne 0 ]]; then
            handle_failure "$CLI_EXIT_CODE"
            HANDLE_FAILURE_RETURN=$?
            if [[ $HANDLE_FAILURE_RETURN -eq 0 ]]; then
                # Continue to next iteration - skip rest of this iteration
                continue
            fi
        else
            reset_failure_counter
        fi

        # Extract structured log if enabled
        if [[ "$EXTRACT_STRUCTURED" == true ]]; then
            extract_single_log "$LOG_FILE" "$METADATA_DIR"
        fi

        # Check if current mode should stop early (TODO/in-progress with no items)
        # This prevents unnecessary next iterations when mode-specific work is done
        if should_stop_current_mode "$METADATA_DIR"; then
            log_info "Mode-specific work complete. Stopping early due to --stop-when-done flag."
            return 0
        fi

        # Check for user-requested stop file (graceful stop after current iteration)
        local stop_file="$METADATA_DIR/.stop"
        if [[ -f "$stop_file" ]]; then
            log_info "Stop requested via .stop file. Exiting gracefully after iteration $i."
            rm -f "$stop_file" 2>/dev/null
            exit $EXIT_ABORTED
        fi

        # Handle non-zero CLI exit that handle_failure didn't absorb
        if [[ $CLI_EXIT_CODE -ne 0 && $HANDLE_FAILURE_RETURN -ne 0 ]]; then
            if [[ $CLI_EXIT_CODE -eq $EXIT_SIGNAL_TERMINATED && $CONTINUE_ON_TIMEOUT == true ]]; then
                log_warn "Timeout detected on iteration $i, continuing to next iteration..."
            else
                exit "$CLI_EXIT_CODE"
            fi
        fi

        # Stuck detection: check if agent made any changes this iteration
        local post_iteration_head=""
        local post_iteration_dirty=""
        if command -v git >/dev/null 2>&1 && git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
            post_iteration_head=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
            post_iteration_dirty=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null || echo "")
        fi

        if [[ "$pre_iteration_head" == "$post_iteration_head" && "$pre_iteration_dirty" == "$post_iteration_dirty" ]]; then
            ((consecutive_no_change++))
            log_warn "No changes detected in iteration $i ($consecutive_no_change/$MAX_NO_CHANGE_ITERATIONS consecutive)"
            if [[ $consecutive_no_change -ge $MAX_NO_CHANGE_ITERATIONS ]]; then
                log_error "Stopped: $MAX_NO_CHANGE_ITERATIONS consecutive iterations with no changes. Check feature status and resolve any blockers."
                exit $EXIT_ABORTED
            fi
        else
            consecutive_no_change=0
        fi

        ((i++))
    done
else
    log_info "Running $MAX_ITERATIONS iterations"
    for ((i=1; i<=MAX_ITERATIONS; i++)); do
        printf -v LOG_FILE "%s/%03d.log" "$ITERATIONS_DIR_FULL" "$NEXT_LOG_INDEX"
        NEXT_LOG_INDEX=$((NEXT_LOG_INDEX + 1))

        # Check project completion BEFORE entering subshell (exit inside subshell doesn't work)
        # Phase 1: Creates .project_completion_pending, returns 1 (continue to TODO review)
        # Phase 2: Pending file exists + still complete, returns 0 (confirmed complete)
        # Skip for audit mode - audits should always run regardless of completion
        if [[ "$AUDIT_MODE" != "true" ]] && check_project_completion "$METADATA_DIR"; then
            log_info "Project completion CONFIRMED. All features pass, thorough review complete."
            # Extract structured log for this empty iteration
            if [[ "$EXTRACT_STRUCTURED" == true ]]; then
                echo "[INFO] Project completion CONFIRMED. All features pass, thorough review complete." > "$LOG_FILE"
                extract_single_log "$LOG_FILE" "$METADATA_DIR"
            fi
            exit $EXIT_PROJECT_COMPLETE
        fi

        {
            # Determine which prompt to use based on project state (needed for header)
            # Will see .project_completion_pending if Phase 1 was triggered above
            PROMPT_INFO=$(determine_prompt "$PROJECT_DIR" "$SCRIPT_DIR" "$METADATA_DIR")
            if [[ $? -ne 0 ]]; then
                log_error "Failed to determine prompt"
                exit $EXIT_GENERAL_ERROR
            fi
            PROMPT_PATH="${PROMPT_INFO%|*}"
            PROMPT_TYPE="${PROMPT_INFO#*|}"

            # Print comprehensive iteration header
            log_iteration_header "$i" "$MAX_ITERATIONS" "$LOG_FILE"

            # Copy shared directories from copydirs.txt
            copy_shared_directories "$PROJECT_DIR" "$SCRIPT_DIR"

            # Copy shared files from copyfiles.txt
            copy_shared_files "$PROJECT_DIR" "$SCRIPT_DIR"

            # Validate that the prompt file exists
            if [[ ! -f "$PROMPT_PATH" ]]; then
                log_error "Prompt file does not exist: $PROMPT_PATH"
                exit $EXIT_GENERAL_ERROR
            fi

            # Copy artifacts if needed (for onboarding/initializer prompts)
            if [[ "$PROMPT_TYPE" != "coding" && "$PROMPT_TYPE" != "directive" && "$PROMPT_TYPE" != "audit" ]]; then
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

            # Check if current mode should stop early (TODO/in-progress with no items)
            # This prevents unnecessary agent invocations when mode-specific work is done
            if should_stop_current_mode "$METADATA_DIR"; then
                log_info "Mode-specific work complete. Stopping early due to --stop-when-done flag."
                exit $EXIT_SUCCESS
            fi

            # Run the appropriate prompt
            prompt_name=$(basename "$PROMPT_PATH" .md)
            log_info "Sending $prompt_name prompt to $CLI_NAME..."
            if [[ "$PROMPT_TYPE" == "coding" || "$PROMPT_TYPE" == "directive" || "$PROMPT_TYPE" == "audit" ]]; then
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

            # Clean up audit-prompt.md after audit mode completes
            if [[ "$PROMPT_TYPE" == "audit" ]]; then
                rm -f "$METADATA_DIR/audit-prompt.md" 2>/dev/null
                log_debug "Removed audit-prompt.md"
            fi

            # Save CLI exit code to file so parent shell can read it
            # (variables set inside { ... } | tee subshell don't propagate)
            echo "$CLI_EXIT_CODE" > "$LOG_FILE.exitcode"

            log_info "--- End of iteration $i ---"
            log_info "Finished: $(date -Is 2>/dev/null || date)"
            echo
        } 2>&1 | tee "$LOG_FILE"

        # Read CLI exit code from file (subshell variables don't propagate through pipe)
        CLI_EXIT_CODE=$(cat "$LOG_FILE.exitcode" 2>/dev/null || echo "0")
        rm -f "$LOG_FILE.exitcode" 2>/dev/null

        # Handle failure or reset counter based on CLI exit code
        HANDLE_FAILURE_RETURN=0
        if [[ $CLI_EXIT_CODE -ne 0 ]]; then
            handle_failure "$CLI_EXIT_CODE"
            HANDLE_FAILURE_RETURN=$?
            if [[ $HANDLE_FAILURE_RETURN -eq 0 ]]; then
                # Continue to next iteration
                continue
            fi
        else
            reset_failure_counter
        fi

        # Extract structured log if enabled
        if [[ "$EXTRACT_STRUCTURED" == true ]]; then
            extract_single_log "$LOG_FILE" "$METADATA_DIR"
        fi

        # Check if current mode should stop early (TODO/in-progress with no items)
        # This prevents unnecessary next iterations when mode-specific work is done
        if should_stop_current_mode "$METADATA_DIR"; then
            log_info "Mode-specific work complete. Stopping early due to --stop-when-done flag."
            return 0
        fi

        # Check for user-requested stop file (graceful stop after current iteration)
        local stop_file="$METADATA_DIR/.stop"
        if [[ -f "$stop_file" ]]; then
            log_info "Stop requested via .stop file. Exiting gracefully after iteration $i."
            rm -f "$stop_file" 2>/dev/null
            exit $EXIT_ABORTED
        fi

        # Handle non-zero CLI exit that handle_failure didn't absorb
        if [[ $CLI_EXIT_CODE -ne 0 && $HANDLE_FAILURE_RETURN -ne 0 ]]; then
            if [[ $CLI_EXIT_CODE -eq $EXIT_SIGNAL_TERMINATED && $CONTINUE_ON_TIMEOUT == true ]]; then
                log_warn "Timeout detected on iteration $i, continuing to next iteration..."
            else
                exit "$CLI_EXIT_CODE"
            fi
        fi
    done
fi

log_info "Audit iterations completed for: $AUDIT_NAME"
}

# ---------------------------------------------------------------------------
# Execute Audit(s)
# ---------------------------------------------------------------------------
if [[ "$AUDIT_MODE" == "true" && ${#AUDIT_NAMES[@]} -gt 1 ]]; then
    # Multiple audits - run each sequentially
    total_audits=${#AUDIT_NAMES[@]}
    log_info "Running $total_audits audits sequentially: ${AUDIT_NAMES[*]}"

    for ((audit_idx=0; audit_idx<total_audits; audit_idx++)); do
        current_audit="${AUDIT_NAMES[$audit_idx]}"
        AUDIT_INDEX=$audit_idx
        export AUDIT_INDEX

        run_single_audit_or_all "$current_audit" "$((audit_idx + 1))" "$total_audits"

        # Clean up audit-specific files between audits
        rm -f "$METADATA_DIR/audit-prompt.md" 2>/dev/null

        if [[ $audit_idx -lt $((total_audits - 1)) ]]; then
            log_info ""
            log_info "Proceeding to next audit..."
            log_info ""
        fi
    done

    log_info "All $total_audits audits completed successfully"
else
    # Single audit or non-audit mode - run once
    run_single_audit_or_all "$AUDIT_NAME" "1" "1"
    log_info "AI development driver completed successfully"
fi

exit $EXIT_SUCCESS
