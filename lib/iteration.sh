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
: "${PHASE_IN_PROGRESS:="in-progress"}"

readonly PHASE_ONBOARDING
readonly PHASE_INITIALIZER
readonly PHASE_CODING
readonly PHASE_IN_PROGRESS

# -----------------------------------------------------------------------------
# Feature File Validation Functions
# -----------------------------------------------------------------------------

# Validate feature.json file structure
validate_feature_file() {
    local feature_file="$1"

    if [[ ! -f "$feature_file" ]]; then
        log_error "Feature file does not exist: $feature_file"
        return 1
    fi

    if ! jq empty "$feature_file" 2>/dev/null; then
        log_error "Invalid JSON in feature file: $feature_file"
        return 1
    fi

    if ! jq -e 'type == "object"' "$feature_file" >/dev/null 2>&1; then
        log_error "Feature file must be a JSON object: $feature_file"
        return 1
    fi

    # format requires: id, category, description
    if ! jq -e 'has("id")' "$feature_file" >/dev/null 2>&1; then
        log_error "Missing id field in feature file: $feature_file"
        return 1
    fi

    if ! jq -e 'has("category")' "$feature_file" >/dev/null 2>&1; then
        log_error "Missing category field in feature file: $feature_file"
        return 1
    fi

    if ! jq -e 'has("description")' "$feature_file" >/dev/null 2>&1; then
        log_error "Missing description field in feature file: $feature_file"
        return 1
    fi

    return 0
}

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
    local spec_path="$metadata_dir/$DEFAULT_SPEC_FILE"
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
# Audit Prompt Generation
# -----------------------------------------------------------------------------

# Copy audit files referenced by the main audit to the target project
# Arguments: $1 = main audit file path, $2 = target audits directory, $3 = source audits directory
# Returns: 0 on success
copy_referenced_audits() {
    local audit_file="$1"
    local target_dir="$2"
    local source_dir="$3"

    # Create target directory if it doesn't exist
    mkdir -p "$target_dir"

    # Always copy the main audit file
    cp "$audit_file" "$target_dir/"

    # Find all cross-references like [NAME.md](./NAME.md) or [NAME](./NAME.md)
    local refs
    refs=$(grep -oE '\[.*?\]\(\./[A-Z_]+\.md\)' "$audit_file" 2>/dev/null | \
           grep -oE '\./[A-Z_]+\.md' | \
           sed 's|^\./||' | \
           sort -u)

    # Copy each referenced file
    local copied=0
    for ref_file in $refs; do
        local source_path="$source_dir/$ref_file"
        if [[ -f "$source_path" ]]; then
            cp "$source_path" "$target_dir/"
            ((copied++))
            log_debug "Copied referenced audit: $ref_file"
        fi
    done

    if [[ $copied -gt 0 ]]; then
        log_info "Copied $copied referenced audit file(s) to $target_dir"
    fi

    return 0
}

# Generate audit prompt file from audit guidelines
# Usage: generate_audit_prompt <audit_file> <output_file> <audit_name>
# Returns: 0 on success, 1 on failure
generate_audit_prompt() {
    local audit_file="$1"
    local output_file="$2"
    local audit_name="$3"

    # Ensure parent directory exists
    local output_dir
    output_dir=$(dirname "$output_file")
    if ! mkdir -p "$output_dir" 2>/dev/null; then
        log_error "Failed to create directory: $output_dir"
        return 1
    fi

    # Extract frontmatter from audit file
    local audit_category audit_priority
    audit_category=$(sed -n '/^---$/,/^---$/p' "$audit_file" | grep "^category:" | sed "s/category:[[:space:]]*['\"]\\?\\([^'\"]*\\)['\"]\\?/\\1/")
    audit_priority=$(sed -n '/^---$/,/^---$/p' "$audit_file" | grep "^priority:" | sed "s/priority:[[:space:]]*['\"]\\?\\([^'\"]*\\)['\"]\\?/\\1/")

    # Default values if not found
    [[ -z "$audit_category" ]] && audit_category="Audit"
    [[ -z "$audit_priority" ]] && audit_priority="High"

    # Copy referenced audit files to target project
    local target_audits_dir="$output_dir/$DEFAULT_TARGET_AUDITS_DIR"
    copy_referenced_audits "$audit_file" "$target_audits_dir" "$(dirname "$audit_file")"

    # Convert audit name to lowercase for IDs
    local audit_name_lower="${audit_name,,}"

    # Generate the audit prompt header
    cat > "$output_file" << 'HEREDOC_HEADER'
## YOUR ROLE - AUDIT AGENT

You are in AUDIT mode performing a comprehensive codebase audit.

### CRITICAL INSTRUCTIONS

1. **Perform a thorough audit** of the codebase following the audit guidelines below
2. **Create feature.json files** for each issue found in `/.automaker/features/`
3. **Do NOT fix issues directly** - only document them as issues for later resolution
4. **Generate an audit report** summarizing all findings
5. **Be thorough and systematic** - cover all areas specified in the audit

### QUICK REFERENCES

- **Spec (source of truth):** `/.automaker/app_spec.txt`
- **Architecture map:** `/.automaker/project_structure.md`
- **Feature tests checklist:** `/.automaker/features/*/feature.json`
- **Changelog:** `/.automaker/CHANGELOG.md`
- **Audit reference materials:** `/.automaker/audits/` (if audit guidelines reference other audits)
- **Project overrides (highest priority):** `/.automaker/project.txt`

### COMMON GUIDELINES

**See shared documentation in `/_common/` for:**

- **hard-constraints.md** - Non-negotiable constraints
- **assistant-rules-loading.md** - How to load and apply project rules (Step 0)
- **project-overrides.md** - How to handle project.txt overrides

### HARD CONSTRAINTS

1. **Do not run** `scripts/setup.ts` or any other setup scripts.
2. If there is a **blocking ambiguity** or missing requirements, **stop** and record in `/.automaker/CHANGELOG.md`.
3. Do not run any blocking processes (no dev servers inline).
4. **Do NOT fix issues** - only document them as feature.json files.

---

## WORKFLOW STEPS

### STEP 0: INGEST ASSISTANT RULES

**CRITICAL: Execute FIRST, before any other steps.**

See `/_common/assistant-rules-loading.md` for complete instructions.

---

### STEP 1: LOAD AUDIT GUIDELINES

**Read and understand the complete audit framework below.**

The audit guidelines define:
- What areas to examine
- What criteria to use
- How to classify severity
- What deliverables to produce

---

### STEP 2: PERFORM SYSTEMATIC AUDIT

**Follow the audit checklist systematically:**

1. **Examine each area** specified in the audit guidelines
2. **Search for violations** using grep, file reading, and code analysis
3. **Document each finding** with:
   - Exact file path and line number
   - Description of the issue
   - Severity classification
   - Recommended remediation
4. **Cross-reference** with project spec and architecture

---

### STEP 3: CHECK FOR EXISTING FEATURES

**Before creating any issue, check for duplicates:**

1. **Read existing features** in \`/.automaker/features/*/feature.json\`
2. **Compare by affected files and issue type** - not just title
3. **Skip creation if:**
   - An existing feature covers the same file(s) AND issue type
   - The existing feature has \`status: "in-progress"\` or \`status: "done"\`
   - The existing feature's \`spec\` already addresses this exact issue
4. **Update existing feature if:**
   - Same issue but new affected files discovered
   - Additional context improves the existing spec

**Deduplication Criteria:**
- Same \`affectedFiles[]\` entries + same issue category = likely duplicate (skip)
- Similar \`title\` + same \`auditSource\` from previous audit = already tracked (skip)
- Existing feature with \`passes: false\` = issue still tracked, don't create duplicate
- Existing feature with \`passes: true\` = issue resolved, verify fix still valid before skipping

**Only create new feature if:**
- No existing feature covers the same file(s) AND issue type
- The issue is genuinely new and not already in backlog/in-progress

---

### STEP 4: CREATE ISSUES AS FEATURE.JSON FILES

**For each NEW issue found (after deduplication), create a feature.json file:**

HEREDOC_HEADER

    # Add dynamic content with audit-specific values
    cat >> "$output_file" << HEREDOC_DYNAMIC
**Issue ID Format:** \`feature-{timestamp}-{random}\` (standard automaker format)

**Feature JSON Structure:**

\`\`\`json
{
  "id": "feature-{timestamp}-{random}",
  "title": "Brief title of the issue",
  "description": "Detailed description of the issue found",
  "status": "backlog",
  "category": "${audit_category}",
  "priority": {severity_based_priority},
  "passes": false,
  "spec": "Detailed remediation steps:\\n1. Step one\\n2. Step two\\n...",
  "createdAt": "{ISO_timestamp}",
  "updatedAt": "{ISO_timestamp}",
  "auditSource": "${audit_name}",
  "auditSeverity": "{Critical|High|Medium|Low}",
  "affectedFiles": ["path/to/file1.ts", "path/to/file2.ts"]
}
\`\`\`

**Severity to Priority Mapping:**

| Audit Severity | Feature Priority |
|----------------|------------------|
| Critical       | 1                |
| High           | 2                |
| Medium         | 3                |
| Low            | 4                |

**File Location:** \`/.automaker/features/audit-${audit_name_lower}-{timestamp}-{random}/feature.json\`

---

### STEP 5: GENERATE AUDIT REPORT

**Create audit report at:** \`/.automaker/${DEFAULT_AUDIT_REPORTS_DIR}/${audit_name}-{timestamp}.md\`

**Report Structure:**

\`\`\`markdown
# ${audit_name} Audit Report - {YYYY-MM-DD}

## Executive Summary

**Audit Name:** ${audit_name}
**Date:** {YYYY-MM-DD}
**Overall Score:** {X}/100
**Critical Issues:** {count}
**High Priority Issues:** {count}
**Medium Priority Issues:** {count}
**Low Priority Issues:** {count}

## Key Findings

[Bullet summary of most important findings]

## Issues by Severity

### Critical Issues (Priority 1)
[List with links to feature.json files]

### High Priority Issues (Priority 2)
[List with links to feature.json files]

### Medium Priority Issues (Priority 3)
[List with links to feature.json files]

### Low Priority Issues (Priority 4)
[List with links to feature.json files]

## Recommendations

### Immediate Actions (0-24 hours)
[Critical issues to address]

### Short-term Actions (1-2 weeks)
[High priority issues]

### Long-term Actions (1-3 months)
[Medium/Low priority issues]

---

**Auditor:** AIDD Audit Agent
**Audit Framework:** ${audit_name}
\`\`\`

---

### STEP 6: UPDATE CHANGELOG

**Add audit summary to \`/.automaker/CHANGELOG.md\`:**

\`\`\`markdown
## [{YYYY-MM-DD}] - ${audit_name} Audit

### Audit Summary
- **Issues Found:** {total_count}
- **Critical:** {count}
- **High:** {count}
- **Medium:** {count}
- **Low:** {count}

### Issues Created
- feature-{timestamp}-{random1}: {title} (${audit_name})
- feature-{timestamp}-{random2}: {title} (${audit_name})
...

### Report Location
- Full report: \`.automaker/${DEFAULT_AUDIT_REPORTS_DIR}/${audit_name}-{timestamp}.md\`
\`\`\`

---

### STEP 7: COMMIT AND EXIT

**Commit all changes:**

\`\`\`bash
git add .
git commit -m "audit(${audit_name_lower}): Complete ${audit_name} audit

- Found {total} issues ({critical} critical, {high} high, {medium} medium, {low} low)
- Created feature.json files for each issue
- Generated audit report at .automaker/${DEFAULT_AUDIT_REPORTS_DIR}/${audit_name}-{timestamp}.md"
\`\`\`

---

## REFERENCE MATERIALS

If the audit guidelines below reference other audit files (e.g., "See [PERFORMANCE.md](./PERFORMANCE.md)"),
those referenced files have been copied to \`/.automaker/${DEFAULT_TARGET_AUDITS_DIR}/\` for your reference.

Read referenced audit files when:
- The main audit refers you to another audit for detailed criteria
- You need additional context for severity classification
- Specialized patterns or thresholds are documented elsewhere

---

## AUDIT GUIDELINES

**The following audit framework defines the scope, criteria, and deliverables for this audit:**

---

HEREDOC_DYNAMIC

    # Append the actual audit file content (skip frontmatter)
    sed '1,/^---$/d; 1,/^---$/d' "$audit_file" >> "$output_file"

    # Add closing instructions
    cat >> "$output_file" << 'HEREDOC_FOOTER'

---

## IMPORTANT REMINDERS

### Your Goal

**Systematically audit the codebase and create issue files for all findings.**

### This Session's Goal

**Complete the entire audit framework, documenting all issues found.**

### Quality Bar

- **Thoroughness:** Cover all areas specified in the audit
- **Accuracy:** Correct severity classifications
- **Actionability:** Clear remediation steps in each issue
- **Documentation:** Complete audit report with all findings

### Do NOT

- Fix issues directly (only document them)
- Skip sections of the audit
- Guess at severity (use the classification guidelines)
- Create duplicate issues for the same problem

---

Begin by running Step 0 now.
HEREDOC_FOOTER

    # Verify file was created
    if [[ ! -f "$output_file" ]]; then
        log_error "Failed to create audit prompt file: $output_file"
        return 1
    fi

    # Ensure file is written to disk
    sync "$output_file" 2>/dev/null || true

    log_debug "Generated audit prompt at $output_file"
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

    # Convert metadata_dir to absolute path to avoid relative path issues
    if [[ ! "$metadata_dir" = /* ]]; then
        metadata_dir="$(cd "$(dirname "$metadata_dir")" && pwd)/$(basename "$metadata_dir")"
    fi

    local prompt_path=""
    local phase=""
    local todo_check_path="$metadata_dir/todo.md"

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
- Document your work in .automaker/CHANGELOG.md
- Commit your changes with descriptive messages

### PROJECT CONTEXT

**Quick References:**

- **Spec (source of truth):** `/.automaker/app_spec.txt`
- **Architecture map:** `/.automaker/project_structure.md`
- **Feature tests checklist:** `/.automaker/features/*/feature.json`
- **Todo list:** `/.automaker/todo.md`
- **Changelog:** `/.automaker/CHANGELOG.md`

### ASSISTANT RULES

**STEP 0: Load project rules (if they exist):**

- Read `.windsurf/rules/`, `CLAUDE.md`, `AGENTS.md`
- Apply these rules throughout your work
- Assistant rules override generic instructions

### COMPLETION

When you've completed the directive:

1. Document what you did in .automaker/CHANGELOG.md
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
        phase="$PHASE_DIRECTIVE"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for audit mode
    if [[ "$AUDIT_MODE" == true ]]; then
        log_info "Using AUDIT mode - will perform $AUDIT_NAME audit"

        # Validate audit file exists and get path
        local audit_file
        audit_file=$(validate_audit "$AUDIT_NAME" "$script_dir")
        if [[ $? -ne 0 ]]; then
            log_error "Audit validation failed"
            return 1
        fi

        # Generate audit prompt file
        local audit_prompt_file="$metadata_dir/audit-prompt.md"
        if ! generate_audit_prompt "$audit_file" "$audit_prompt_file" "$AUDIT_NAME"; then
            log_error "Failed to generate audit prompt"
            return 1
        fi

        prompt_path="$audit_prompt_file"
        phase="$PHASE_AUDIT"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for project completion pending state (two-phase completion)
    # If pending, force TODO mode for thorough review
    local completion_state_file="$metadata_dir/.project_completion_pending"
    if [[ -f "$completion_state_file" ]]; then
        log_info "Project completion pending - running thorough TODO review"
        prompt_path="$script_dir/prompts/todo.md"
        phase="$PHASE_TODO"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for TODO mode first
    if [[ "$TODO_MODE" == true ]]; then
        log_info "Using TODO mode - will search for TODO items in codebase"
        prompt_path="$script_dir/prompts/todo.md"
        phase="$PHASE_TODO"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for VALIDATE mode
    if [[ "$VALIDATE_MODE" == true ]]; then
        log_info "Using VALIDATE mode - will validate incomplete features and todos"
        prompt_path="$script_dir/prompts/validate.md"
        phase="$PHASE_VALIDATE"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for IN_PROGRESS mode
    if [[ "$IN_PROGRESS_MODE" == true ]]; then
        log_info "Using IN_PROGRESS mode - focusing on in-progress features only"
        prompt_path="$script_dir/prompts/in-progress.md"
        phase="$PHASE_IN_PROGRESS"
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
    local features_dir="$metadata_dir/${DEFAULT_FEATURES_DIR}"
    local todo_path="$metadata_dir/${DEFAULT_TODO_FILE}"
    local completion_state_file="$metadata_dir/.project_completion_pending"

    # Check if features directory exists
    if [[ ! -d "$features_dir" ]]; then
        log_debug "Features directory not found, project not complete"
        # Clear pending state if project regressed
        rm -f "$completion_state_file" 2>/dev/null
        return 1
    fi

    # Count features with "passes": false in individual feature files
    local failing_count=0
    if command -v jq >/dev/null 2>&1; then
        # Use jq if available for accurate JSON parsing
        # Check each individual feature file
        for feature_file in "$features_dir"/*/feature.json; do
            if [[ -f "$feature_file" ]]; then
                # Validate feature file structure first
                if ! validate_feature_file "$feature_file"; then
                    log_error "Invalid feature file structure: $feature_file"
                    ((failing_count++))
                    continue
                fi

                local passes=$(jq -r '.passes // false' "$feature_file" 2>/dev/null || echo "error")
                if [[ "$passes" == "error" ]]; then
                    log_error "Failed to parse metadata in $feature_file"
                    ((failing_count++))
                elif [[ "$passes" == "false" ]]; then
                    ((failing_count++))
                fi
            fi
        done
    else
        # Fallback to grep - search for "passes": false in all feature files
        failing_count=$(grep -r '"passes"[[:space:]]*:[[:space:]]*false' "$features_dir" 2>/dev/null | wc -l || echo "0")
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

# -----------------------------------------------------------------------------
# Mode Completion Detection
# -----------------------------------------------------------------------------

# Check if TODO mode should stop (no todos remaining)
# Usage: should_stop_todo_mode <metadata_dir>
# Returns: 0 if no todos remain (should stop), 1 if todos exist
should_stop_todo_mode() {
    local metadata_dir="$1"
    local todo_path="$metadata_dir/${DEFAULT_TODO_FILE}"

    # If todo file doesn't exist, we should stop
    if [[ ! -f "$todo_path" ]]; then
        log_debug "No todo file found, TODO mode can stop"
        return 0
    fi

    # Check for various incomplete TODO patterns
    # Pattern 1: Standard markdown checkbox: - [ ]
    # Pattern 2: With spaces: - [   ]
    # Pattern 3: Alternative format: - [ ]
    # Pattern 4: TODO comments: # TODO or // TODO
    if grep -q -E '^\s*-\s*\[\s*\]' "$todo_path" 2>/dev/null; then
        log_debug "Found incomplete markdown checkbox TODOs, continuing"
        return 1
    elif grep -q -E '^\s*#\s*TODO\b|^\s*//\s*TODO\b' "$todo_path" 2>/dev/null; then
        log_debug "Found TODO comments, continuing"
        return 1
    else
        # Check if file contains "ALL TODO ITEMS COMPLETE" or similar
        if grep -q -i "ALL TODO ITEMS COMPLETE\|TODO.*COMPLETE\|no.*todo.*remain" "$todo_path" 2>/dev/null; then
            log_debug "TODO file indicates all items complete"
            return 0
        fi
        log_debug "No incomplete TODO items remaining"
        return 0
    fi
}

# Check if IN_PROGRESS mode should stop (no in-progress features)
# Usage: should_stop_in_progress_mode <metadata_dir>
# Returns: 0 if no in-progress features (should stop), 1 if in-progress features exist
should_stop_in_progress_mode() {
    local metadata_dir="$1"
    local features_dir="$metadata_dir/${DEFAULT_FEATURES_DIR}"

    # If features directory doesn't exist, we should stop
    if [[ ! -d "$features_dir" ]]; then
        log_debug "No features directory, IN_PROGRESS mode can stop"
        return 0
    fi

    # Check for in-progress features using jq if available
    if command -v jq >/dev/null 2>&1; then
        local in_progress_count=0
        for feature_file in "$features_dir"/*/feature.json; do
            if [[ -f "$feature_file" ]]; then
                local status=$(jq -r '.status // ""' "$feature_file" 2>/dev/null)
                if [[ "$status" == "in_progress" ]]; then
                    ((in_progress_count++))
                fi
            fi
        done

        if [[ $in_progress_count -gt 0 ]]; then
            log_debug "Found $in_progress_count in-progress features, continuing"
            return 1
        else
            log_debug "No in-progress features remaining"
            return 0
        fi
    else
        # Fallback to grep
        if grep -r '"status"[[:space:]]*:[[:space:]]*"in_progress"' "$features_dir" >/dev/null 2>&1; then
            log_debug "Found in-progress features (grep), continuing"
            return 1
        else
            log_debug "No in-progress features remaining (grep)"
            return 0
        fi
    fi
}

# Check if AUDIT mode should stop (audit report generated)
# Usage: should_stop_audit_mode <metadata_dir>
# Returns: 0 if audit complete (should stop), 1 if audit in progress
should_stop_audit_mode() {
    local metadata_dir="$1"
    local audit_reports_dir="$metadata_dir/$DEFAULT_AUDIT_REPORTS_DIR"

    # Check if an audit report was generated in this session
    # The audit prompt instructs the agent to create a report
    # If a report exists with today's date and matches AUDIT_NAME, audit is complete
    if [[ -d "$audit_reports_dir" ]]; then
        local today
        today=$(date +%Y-%m-%d)
        if ls "$audit_reports_dir"/${AUDIT_NAME}*${today}*.md >/dev/null 2>&1; then
            log_debug "Audit report found for $AUDIT_NAME on $today"
            return 0
        fi
    fi

    return 1
}

# Check if current mode should stop early
# Usage: should_stop_current_mode <metadata_dir>
# Returns: 0 if should stop, 1 if should continue
should_stop_current_mode() {
    local metadata_dir="$1"

    # Audit mode always auto-stops when complete (implies --stop-when-done)
    if [[ "$AUDIT_MODE" == "true" ]]; then
        if should_stop_audit_mode "$metadata_dir"; then
            log_info "AUDIT mode: Audit complete - report generated"
            return 0
        fi
        # Continue if audit not yet complete
        return 1
    fi

    # Only check if STOP_WHEN_DONE flag is enabled for other modes
    if [[ "$STOP_WHEN_DONE" != "true" ]]; then
        return 1
    fi

    # Check based on current mode
    if [[ "$TODO_MODE" == "true" ]]; then
        if should_stop_todo_mode "$metadata_dir"; then
            log_info "TODO mode: No remaining TODO items and --stop-when-done enabled"
            return 0
        fi
    elif [[ "$IN_PROGRESS_MODE" == "true" ]]; then
        if should_stop_in_progress_mode "$metadata_dir"; then
            log_info "IN_PROGRESS mode: No remaining in-progress features and --stop-when-done enabled"
            return 0
        fi
    fi

    return 1
}
