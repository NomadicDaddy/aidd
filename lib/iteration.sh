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
# Usage: check_onboarding_status <metadata_dir>
# Returns: 0 if onboarding complete, 1 if incomplete
check_onboarding_status() {
    local metadata_dir="$1"

    # Check if critical onboarding artifacts exist
    # These files/directories are ALWAYS created during onboarding
    local features_dir="$metadata_dir/$DEFAULT_FEATURES_DIR"
    local spec_path="$metadata_dir/$DEFAULT_AIDD_SPEC_FILE"
    local changelog_path="$metadata_dir/CHANGELOG.md"

    # Features directory must exist with at least one feature
    if [[ ! -d "$features_dir" ]]; then
        log_debug "Onboarding incomplete: features directory not found"
        return 1
    fi

    # Check if features directory has any feature.json files
    local feature_count
    feature_count=$(find "$features_dir" -type f -name "feature.json" 2>/dev/null | wc -l)
    if [[ "$feature_count" -eq 0 ]]; then
        log_debug "Onboarding incomplete: no features found"
        return 1
    fi

    # Spec file must exist
    if [[ ! -f "$spec_path" ]]; then
        log_debug "Onboarding incomplete: spec file not found at $spec_path"
        return 1
    fi

    # Changelog must exist
    if [[ ! -f "$changelog_path" ]]; then
        log_debug "Onboarding incomplete: CHANGELOG.md not found"
        return 1
    fi

    # All checks passed - onboarding is complete
    log_debug "Onboarding complete: found $feature_count features, spec, and changelog"
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

    # Check for custom directive mode first (highest priority)
    if [[ -n "$CUSTOM_PROMPT" ]]; then
        log_info "Using custom directive mode"
        # Create a temporary directive prompt file
        local directive_file="$metadata_dir/directive.md"
        # Ensure metadata directory exists
        if ! mkdir -p "$metadata_dir" 2>/dev/null; then
            log_error "Failed to create metadata directory: $metadata_dir"
            return 1
        fi
        # Create the directive file with error checking
        if ! cat > "$directive_file" << 'HEREDOC_END'
## YOUR ROLE - CUSTOM DIRECTIVE MODE

You are an AI development assistant executing a custom user directive.

### CRITICAL INSTRUCTIONS

1. **Read and understand the directive below**
2. **Execute ONLY what is requested in the directive**
3. **Do NOT modify features unless explicitly requested**
4. **Do NOT implement new features unless directive asks for it**
5. **Focus on completing the directive thoroughly and accurately**

### USER DIRECTIVE

HEREDOC_END
        then
            log_error "Failed to create directive file: $directive_file"
            return 1
        fi
        # Append the custom prompt safely using printf
        if ! printf '%s\n' "$CUSTOM_PROMPT" >> "$directive_file"; then
            log_error "Failed to append custom prompt to directive file"
            return 1
        fi
        if ! cat >> "$directive_file" << 'HEREDOC_END'

### EXECUTION GUIDELINES

- If the directive requires code changes, make them carefully
- If the directive requires analysis, provide thorough analysis
- If the directive requires testing, run comprehensive tests
- If the directive requires fixes, fix all identified issues
- Document your work in .aidd/CHANGELOG.md
- Commit your changes with descriptive messages

### PROJECT CONTEXT

**Quick References:**

- **Spec (source of truth):** `/.aidd/app_spec.txt`
- **Architecture map:** `/.aidd/project_structure.md`
- **Feature tests checklist:** `/.aidd/features/*/feature.json`
- **Todo list:** `/.aidd/todo.md`
- **Changelog:** `/.aidd/CHANGELOG.md`

### ASSISTANT RULES

**STEP 0: Load project rules (if they exist):**

- Read `.windsurf/rules/`, `CLAUDE.md`, `AGENTS.md`
- Apply these rules throughout your work
- Assistant rules override generic instructions

### COMPLETION

When you've completed the directive:

1. Document what you did in .aidd/CHANGELOG.md
2. Commit all changes
3. Summarize your work
4. Exit cleanly

---

Begin by understanding the directive and executing it now.
HEREDOC_END
        then
            log_error "Failed to append execution guidelines to directive file"
            return 1
        fi
        # Verify the file was created successfully
        if [[ ! -f "$directive_file" ]]; then
            log_error "Directive file was not created: $directive_file"
            return 1
        fi
        # Ensure file is written to disk
        sync "$directive_file" 2>/dev/null || true
        prompt_path="$directive_file"
        phase="directive"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for project completion pending state (two-phase completion)
    # If pending, force TODO mode for thorough review
    local completion_state_file="$metadata_dir/.project_completion_pending"
    if [[ -f "$completion_state_file" ]]; then
        log_info "Project completion pending - running thorough TODO review"
        prompt_path="$script_dir/prompts/todo.md"
        phase="$PHASE_CODING"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for TODO mode first
    if [[ "$TODO_MODE" == true ]]; then
        log_info "Using TODO mode - will search for TODO items in codebase"
        prompt_path="$script_dir/prompts/todo.md"
        phase="$PHASE_CODING"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for VALIDATE mode
    if [[ "$VALIDATE_MODE" == true ]]; then
        log_info "Using VALIDATE mode - will validate incomplete features and todos"
        prompt_path="$script_dir/prompts/validate.md"
        phase="$PHASE_CODING"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check if onboarding is complete by checking for natural artifacts
    # (app_spec.txt, features directory with data, and CHANGELOG.md)
    if check_onboarding_status "$metadata_dir"; then
        log_info "Onboarding complete (all required files found) - proceeding to development"
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

# -----------------------------------------------------------------------------
# Project Completion Detection
# -----------------------------------------------------------------------------

# Check if project is complete (two-phase detection)
# Usage: check_project_completion <metadata_dir>
# Returns: 0 if confirmed complete (second detection), 1 if not complete or needs todo pass
# Phase 1: First detection creates state file and returns 1 (allows TODO pass to run)
# Phase 2: Second detection (state file exists) returns 0 (confirmed complete)
check_project_completion() {
    local metadata_dir="$1"
    local feature_list_path="$metadata_dir/${DEFAULT_FEATURE_LIST_FILE}"
    local todo_path="$metadata_dir/${DEFAULT_TODO_FILE}"
    local completion_state_file="$metadata_dir/.project_completion_pending"

    # Check if features directory exists
    if [[ ! -f "$feature_list_path" ]]; then
        log_debug "Feature list not found, project not complete"
        # Clear pending state if project regressed
        rm -f "$completion_state_file" 2>/dev/null
        return 1
    fi

    # Count features with "passes": false
    local failing_count=0
    if command -v jq >/dev/null 2>&1; then
        # Use jq if available for accurate JSON parsing
        failing_count=$(jq '[.[] | select(.passes == false)] | length' "$feature_list_path" 2>/dev/null || echo "0")
    else
        # Fallback to grep
        failing_count=$(grep -c '"passes"[[:space:]]*:[[:space:]]*false' "$feature_list_path" 2>/dev/null || echo "0")
    fi

    # Check if todo.md exists and has content (beyond just whitespace/headers)
    local has_todos=false
    if [[ -f "$todo_path" ]]; then
        # Check if file has any non-empty, non-comment content
        if grep -q -E '^[^#[:space:]]' "$todo_path" 2>/dev/null; then
            has_todos=true
        fi
    fi

    # Log status
    log_debug "Completion check: failing_count=$failing_count, has_todos=$has_todos"

    # Project is complete if no failing features and no todos
    if [[ "$failing_count" -eq 0 && "$has_todos" == false ]]; then
        # Check if this is first or second detection
        if [[ -f "$completion_state_file" ]]; then
            # Phase 2: State file exists, this is second detection - confirmed complete
            log_info "Project completion CONFIRMED: All features pass after thorough TODO review"
            rm -f "$completion_state_file" 2>/dev/null
            return 0
        else
            # Phase 1: First detection - create state file, allow TODO pass to run
            log_info "Project completion PENDING: All features pass, running thorough TODO review..."
            echo "$(date -Is 2>/dev/null || date)" > "$completion_state_file"
            # Return 1 to allow the iteration to proceed with TODO prompt
            return 1
        fi
    fi

    # Not complete - clear any pending state
    rm -f "$completion_state_file" 2>/dev/null
    return 1
}
