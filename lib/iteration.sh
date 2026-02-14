#!/bin/bash
set -euo pipefail
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
# Feature Filter Functions
# -----------------------------------------------------------------------------

# Check if a feature.json file matches the active --filter-by / --filter criteria.
# Usage: feature_matches_filter <feature_file>
# Returns: 0 if matches (or no filter active), 1 if excluded
feature_matches_filter() {
    local feature_file="$1"

    # No filter active — everything matches
    if [[ -z "$FILTER_BY" || -z "$FILTER_VALUE" ]]; then
        return 0
    fi

    if ! command -v jq >/dev/null 2>&1; then
        # Without jq, fall back to grep-based matching
        # Escape regex metacharacters in FILTER_VALUE to prevent regex injection
        local safe_val
        safe_val=$(printf '%s' "$FILTER_VALUE" | sed 's/[][\\.^$*+?{}()|]/\\&/g')
        if grep -q "\"$FILTER_BY\"" "$feature_file" 2>/dev/null; then
            # For numeric fields (priority), match the raw number
            # For string fields, match the quoted value
            if grep -qE "\"$FILTER_BY\"[[:space:]]*:[[:space:]]*$safe_val([^0-9]|$)" "$feature_file" 2>/dev/null || \
               grep -qE "\"$FILTER_BY\"[[:space:]]*:[[:space:]]*\"$safe_val\"" "$feature_file" 2>/dev/null; then
                return 0
            fi
        fi
        return 1
    fi

    # Use jq for reliable matching — handles both string and numeric values
    local actual
    actual=$(jq -r --arg field "$FILTER_BY" '.[$field] // empty' "$feature_file" 2>/dev/null)
    if [[ "$actual" == "$FILTER_VALUE" ]]; then
        return 0
    fi
    return 1
}

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

    # Validate status enum if present
    local status_val
    status_val=$(jq -r '.status // empty' "$feature_file" 2>/dev/null)
    if [[ -n "$status_val" ]]; then
        local valid_statuses="backlog pending running completed failed verified waiting_approval in_progress"
        if [[ ! " $valid_statuses " =~ " $status_val " ]]; then
            log_error "Invalid status '$status_val' in feature file: $feature_file (valid: $valid_statuses)"
            return 1
        fi
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
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
        log_error "Timeout #$CONSECUTIVE_FAILURES (exit=$exit_code)"
        # Check if we should quit due to repeated timeouts
        if [[ $QUIT_ON_ABORT -gt 0 && $CONSECUTIVE_FAILURES -ge $QUIT_ON_ABORT ]]; then
            log_error "Reached failure threshold ($QUIT_ON_ABORT) due to repeated timeouts; quitting."
            exit "$exit_code"
        fi
        return 0
    fi
    
    # Increment failure counter
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
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
# Rate Limit Handling Functions
# -----------------------------------------------------------------------------

# Parse the reset time from a rate limit message
# Usage: parse_rate_limit_reset <message_string>
# Outputs: Unix timestamp of reset time (stdout), or empty if unparseable
# Supports formats: "resets 2am (America/Chicago)", "resets 7am (America/Chicago)",
#                   "resets 12pm (America/Chicago)", "resets 2:30am (America/Chicago)"
# Note: The reset time is treated as local time since the API reports it in
#       the user's configured timezone, matching the local system clock.
parse_rate_limit_reset() {
    local msg="$1"

    # Extract reset time using bash regex (portable, no grep -P needed)
    # Match: "resets <time><am/pm>" with optional timezone in parens
    # Store regex in variable to avoid shell parsing issues with parentheses
    local re='resets[[:space:]]+([0-9]{1,2})(:[0-9]{2})?[[:space:]]*([ap]m)'
    if [[ ! "$msg" =~ $re ]]; then
        return 1
    fi

    local hour="${BASH_REMATCH[1]}"
    local minute="${BASH_REMATCH[2]#:}"  # Strip leading colon
    local ampm="${BASH_REMATCH[3]^^}"    # Uppercase AM/PM

    minute="${minute:-00}"

    if [[ -z "$hour" ]]; then
        return 1
    fi

    # Convert to 24-hour for date calculation
    local hour24="$hour"
    if [[ "$ampm" == "PM" && "$hour" -ne 12 ]]; then
        hour24=$((hour + 12))
    elif [[ "$ampm" == "AM" && "$hour" -eq 12 ]]; then
        hour24=0
    fi

    # Build target datetime using local time (the API reports reset in user's timezone)
    local today
    today=$(date '+%Y-%m-%d' 2>/dev/null) || return 1
    local target_str="${today} ${hour24}:${minute}:00"

    # Convert to unix timestamp in local timezone
    local target_ts
    target_ts=$(date -d "$target_str" '+%s' 2>/dev/null) || return 1

    # If the target time is in the past, it means the reset is tomorrow
    local now_ts
    now_ts=$(date '+%s' 2>/dev/null) || return 1
    if [[ "$target_ts" -le "$now_ts" ]]; then
        target_ts=$((target_ts + 86400))
    fi

    echo "$target_ts"
    return 0
}

# Handle a rate-limited iteration by sleeping until the reset time
# Usage: handle_rate_limit <log_file>
# Returns: 0 after sleeping (ready to retry)
handle_rate_limit() {
    local log_file="$1"
    local buffer="${DEFAULT_RATE_LIMIT_BUFFER:-60}"
    local fallback="${DEFAULT_RATE_LIMIT_BACKOFF:-300}"

    # Try to parse reset time from the global RATE_LIMIT_RESET_MSG
    # (set by monitor_coprocess_output), falling back to scanning the log file
    local reset_msg="${RATE_LIMIT_RESET_MSG:-}"
    if [[ -z "$reset_msg" && -f "$log_file" ]]; then
        reset_msg=$(grep -m1 "$PATTERN_RATE_LIMIT" "$log_file" 2>/dev/null || true)
    fi

    local reset_ts=""
    if [[ -n "$reset_msg" ]]; then
        reset_ts=$(parse_rate_limit_reset "$reset_msg") || true
    fi

    if [[ -n "$reset_ts" && "$reset_ts" =~ ^[0-9]+$ ]]; then
        local now_ts
        now_ts=$(date '+%s')
        local sleep_secs=$(( reset_ts - now_ts + buffer ))

        if [[ $sleep_secs -gt 0 ]]; then
            local reset_human
            reset_human=$(date -d "@$reset_ts" '+%H:%M %Z' 2>/dev/null || echo "unknown")
            local sleep_min=$(( sleep_secs / 60 ))
            log_info "Rate limited. Sleeping ${sleep_secs}s (~${sleep_min}m) until ${reset_human} + ${buffer}s buffer..."
            sleep "$sleep_secs"
        else
            log_info "Rate limit reset time already passed. Retrying immediately."
        fi
    else
        log_warn "Could not parse rate limit reset time. Sleeping ${fallback}s as fallback..."
        sleep "$fallback"
    fi

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

    # Debug: Log input and current state (using log_info temporarily for diagnosis)
    log_info "Onboarding check: metadata_dir='$metadata_dir' pwd='$(pwd)'"

    # Check if critical onboarding artifacts exist
    # These files/directories are ALWAYS created during onboarding
    local features_dir="$metadata_dir/$DEFAULT_FEATURES_DIR"
    local spec_path="$metadata_dir/$DEFAULT_SPEC_FILE"
    local changelog_path="$metadata_dir/CHANGELOG.md"

    # Features directory must exist with at least one feature
    if [[ ! -d "$features_dir" ]]; then
        log_warn "Onboarding incomplete: features directory not found at '$features_dir'"
        return 1
    fi

    # Check if features directory has any feature.json files
    local feature_count
    feature_count=$(find "$features_dir" -type f -name "feature.json" 2>/dev/null | wc -l)
    if [[ "$feature_count" -eq 0 ]]; then
        log_warn "Onboarding incomplete: no features found in '$features_dir'"
        return 1
    fi

    # Spec file must exist
    if [[ ! -f "$spec_path" ]]; then
        log_warn "Onboarding incomplete: spec file not found at '$spec_path'"
        return 1
    fi

    # Changelog must exist
    if [[ ! -f "$changelog_path" ]]; then
        log_warn "Onboarding incomplete: CHANGELOG.md not found at '$changelog_path'"
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
           sort -u) || true

    # Copy each referenced file
    local copied=0
    for ref_file in $refs; do
        local source_path="$source_dir/$ref_file"
        if [[ -f "$source_path" ]]; then
            cp "$source_path" "$target_dir/"
            copied=$((copied + 1))
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
  "spec": "Detailed remediation steps:\\n1. Step one\\n2. Step two\\n...\\n\\nIMPORTANT: After resolving this finding, locate the feature.json file(s) in .automaker/features/ whose spec originally produced the code or pattern that caused this audit finding. Update those feature.json spec(s) to prevent this issue from being reintroduced during a feature-based rebuild.",
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

**CRITICAL — Feedback Loop Requirement:**

Every audit finding's \`spec\` field MUST end with the following instruction (after the remediation steps):

> IMPORTANT: After resolving this finding, locate the feature.json file(s) in .automaker/features/ whose spec originally produced the code or pattern that caused this audit finding. Update those feature.json spec(s) to prevent this issue from being reintroduced during a feature-based rebuild.

This ensures audit fixes propagate back to the original feature specs, preventing regression during feature-based rebuilds.

**File Location:** \`/.automaker/features/audit-${audit_name_lower}-{unix_timestamp}-{descriptive-slug}/feature.json\`

**Directory Naming Convention:**
- \`{unix_timestamp}\` = Unix epoch timestamp (e.g., 1736985600)
- \`{descriptive-slug}\` = kebab-case description of the specific issue (e.g., kdf-sha256, cors-null-origin, validation-missing)
- Example: \`audit-security-1736985600-jwt-contains-email\`

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
- audit-${audit_name_lower}-{unix_timestamp}-{descriptive-slug}: {title}
- audit-${audit_name_lower}-{unix_timestamp}-{descriptive-slug}: {title}
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
# Prompt Filter Injection
# -----------------------------------------------------------------------------

# If --filter-by / --filter are active, create a wrapped prompt that prepends
# filter instructions. Returns the (possibly new) prompt path.
# Usage: apply_prompt_filter <prompt_path> <metadata_dir>
# Returns: Prompt path to use (original or filtered copy)
apply_prompt_filter() {
    local prompt_path="$1"
    local metadata_dir="$2"

    # No filter active — return original
    if [[ -z "$FILTER_BY" || -z "$FILTER_VALUE" ]]; then
        echo "$prompt_path"
        return
    fi

    local filtered_file="$metadata_dir/filtered-prompt.md"

    cat > "$filtered_file" << FILTER_EOF
## FEATURE FILTER (applied via --filter-by $FILTER_BY --filter $FILTER_VALUE)

**CRITICAL: You MUST only work on features where \`$FILTER_BY\` equals \`$FILTER_VALUE\`.**

When selecting features from \`/.automaker/features/*/feature.json\`:
- Read each feature.json and check its \`$FILTER_BY\` field
- **SKIP** any feature where \`$FILTER_BY\` is NOT \`$FILTER_VALUE\`
- Only consider features matching this filter for implementation, validation, and status reporting
- This filter applies to ALL feature selection throughout this session

---

FILTER_EOF
    cat "$prompt_path" >> "$filtered_file"
    sync "$filtered_file" 2>/dev/null || true
    echo "$filtered_file"
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
        prompt_path=$(apply_prompt_filter "$directive_file" "$metadata_dir")
        phase="$PHASE_DIRECTIVE"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for audit mode
    if [[ "$AUDIT_MODE" == true ]]; then
        log_info "Using AUDIT mode - will perform $AUDIT_NAME audit"

        # Validate audit file exists and get path
        local audit_file
        audit_file=$(validate_audit "$AUDIT_NAME" "$script_dir") || {
            log_error "Audit validation failed"
            return 1
        }

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
        prompt_path=$(apply_prompt_filter "$script_dir/prompts/validate.md" "$metadata_dir")
        phase="$PHASE_VALIDATE"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check for IN_PROGRESS mode
    if [[ "$IN_PROGRESS_MODE" == true ]]; then
        log_info "Using IN_PROGRESS mode - focusing on in-progress features only"
        prompt_path=$(apply_prompt_filter "$script_dir/prompts/in-progress.md" "$metadata_dir")
        phase="$PHASE_IN_PROGRESS"
        echo "$prompt_path|$phase"
        return 0
    fi

    # Check if onboarding is complete by checking for natural artifacts
    # (app_spec.txt, features directory with data, and CHANGELOG.md)
    if check_onboarding_status "$metadata_dir"; then
        log_info "Onboarding complete (all required files found) - proceeding to development"
        prompt_path=$(apply_prompt_filter "$script_dir/prompts/coding.md" "$metadata_dir")
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

# Check if project is complete
# Usage: check_project_completion <metadata_dir>
# Returns: 0 if complete (no failing features, no incomplete TODOs), 1 otherwise
check_project_completion() {
    local metadata_dir="$1"

    # Normalize metadata_dir to absolute path to ensure consistent cache keys
    # Without this, cache entries from different invocations use different path formats
    # (e.g., "groundtruth/.automaker" vs "/d/applications/groundtruth/.automaker")
    if [[ ! "$metadata_dir" = /* ]]; then
        metadata_dir="$(cd "$metadata_dir" 2>/dev/null && pwd)" || metadata_dir="$1"
    fi

    local features_dir="$metadata_dir/${DEFAULT_FEATURES_DIR}"
    local todo_path="$metadata_dir/${DEFAULT_TODO_FILE}"
    local completed_marker="$metadata_dir/.project_completed"
    local state_cache_file="$metadata_dir/.completion_state_cache"

    if [[ ! -d "$features_dir" ]]; then
        log_debug "Features directory not found, project not complete"
        rm -f "$state_cache_file" 2>/dev/null
        return 1
    fi

    declare -A cached_passes
    declare -A cached_status

    # Cache is never loaded from disk — check_project_completion runs once per
    # invocation so cross-run caching only introduces staleness (committed
    # feature updates are invisible to git diff).  The associative arrays are
    # still populated during this call and written out for diagnostics.
    local cache_valid=false

    local modified_files=()
    local unmodified_files=()
    local all_feature_files=()

    if git -C "$metadata_dir/.." rev-parse --git-dir >/dev/null 2>&1; then
        # Collect coding features only — audit findings (audit-*) are tracked
        # separately via count_unfixed_audit_findings() and must not block
        # detection of coding completion for --audit-on-completion.
        while IFS= read -r fpath; do
            local dir_name
            dir_name=$(basename "$(dirname "$fpath")")
            [[ "$dir_name" == audit-* ]] && continue
            # Apply --filter-by / --filter if active
            feature_matches_filter "$fpath" || continue
            all_feature_files+=("$fpath")
        done < <(find "$features_dir" -name "feature.json" -type f 2>/dev/null)

        local git_root
        git_root="$(cd "$metadata_dir/.." 2>/dev/null && pwd)" || git_root="$metadata_dir/.."
        for fpath in "${all_feature_files[@]}"; do
            local rel_path="${fpath#$git_root/}"
            
            if git -C "$git_root" diff --quiet -- "$rel_path" 2>/dev/null && \
               git -C "$git_root" diff --cached --quiet -- "$rel_path" 2>/dev/null; then
                unmodified_files+=("$fpath")
            else
                modified_files+=("$fpath")
            fi
        done
        
        log_debug "Found ${#modified_files[@]} modified, ${#unmodified_files[@]} unmodified features"
    else
        while IFS= read -r fpath; do
            local dir_name
            dir_name=$(basename "$(dirname "$fpath")")
            [[ "$dir_name" == audit-* ]] && continue
            # Apply --filter-by / --filter if active
            feature_matches_filter "$fpath" || continue
            modified_files+=("$fpath")
        done < <(find "$features_dir" -name "feature.json" -type f 2>/dev/null)
        log_debug "Not a git repo, checking all ${#modified_files[@]} coding features"
    fi

    local total_coding_features=$(( ${#modified_files[@]} + ${#unmodified_files[@]} ))
    log_info "Completion check: $total_coding_features coding features (audit findings excluded)"

    local failing_count=0
    local waiting_approval_count=0

    check_feature_file() {
        local feature_file="$1"
        if [[ ! -f "$feature_file" ]]; then
            return 1
        fi

        # Check waiting_approval BEFORE structural validation so that
        # features explicitly held for human review don't block completion
        # even if they have structural issues (e.g., missing id/category)
        local status=$(jq -r '.status // "backlog"' "$feature_file" 2>/dev/null || echo "error")
        if [[ "$status" == "waiting_approval" ]]; then
            waiting_approval_count=$((waiting_approval_count + 1))
            local passes=$(jq -r '.passes // false' "$feature_file" 2>/dev/null || echo "false")
            cached_status["$feature_file"]="$status"
            cached_passes["$feature_file"]="$passes"
            return 0
        fi

        if ! validate_feature_file "$feature_file"; then
            log_error "Invalid feature file structure: $feature_file"
            return 2
        fi

        local passes=$(jq -r '.passes // false' "$feature_file" 2>/dev/null || echo "error")

        if [[ "$passes" == "error" || "$status" == "error" ]]; then
            log_error "Failed to parse metadata in $feature_file"
            return 3
        fi

        cached_status["$feature_file"]="$status"
        cached_passes["$feature_file"]="$passes"

        if [[ "$passes" == "true" && "$status" == "backlog" ]]; then
            log_error "Feature has passes=true but status is still backlog: $feature_file"
            return 1
        elif [[ "$passes" == "false" ]]; then
            return 1
        fi

        return 0
    }

    for feature_file in "${modified_files[@]}"; do
        if ! check_feature_file "$feature_file"; then
            failing_count=$((failing_count + 1))
        fi
    done

    if [[ $cache_valid == true ]]; then
        for feature_file in "${unmodified_files[@]}"; do
            local cached_status_val="${cached_status[$feature_file]:-}"
            local cached_passes_val="${cached_passes[$feature_file]:-}"
            
            if [[ -z "$cached_status_val" || -z "$cached_passes_val" ]]; then
                log_debug "Feature not in cache, checking: $feature_file"
                if ! check_feature_file "$feature_file"; then
                    failing_count=$((failing_count + 1))
                fi
            else
                if [[ "$cached_status_val" == "waiting_approval" ]]; then
                    waiting_approval_count=$((waiting_approval_count + 1))
                    # waiting_approval never blocks completion
                elif [[ "$cached_passes_val" == "false" ]]; then
                    failing_count=$((failing_count + 1))
                fi
            fi
        done
    else
        for feature_file in "${unmodified_files[@]}"; do
            if ! check_feature_file "$feature_file"; then
                failing_count=$((failing_count + 1))
            fi
        done
    fi

    if [[ "$waiting_approval_count" -gt 0 ]]; then
        log_info "Features waiting approval (excluded from completion): $waiting_approval_count"
    fi

    {
        for feature_file in "${!cached_status[@]}"; do
            echo "${feature_file}|${cached_status[$feature_file]}|${cached_passes[$feature_file]}"
        done
    } > "$state_cache_file"
    log_debug "Updated cache with ${#cached_status[@]} feature states"

    local has_todos=false
    local deferred_todo_count=0
    if [[ -f "$todo_path" ]]; then
        # Count actionable incomplete TODOs: - [ ] but NOT deferred - [~] or - [!]
        local incomplete_count=0
        incomplete_count=$(grep -c -E '^\s*-\s*\[\s*\]' "$todo_path" 2>/dev/null | tr -d '\r\n' | xargs || echo "0")
        deferred_todo_count=$(grep -c -E '^\s*-\s*\[[~!]\]' "$todo_path" 2>/dev/null | tr -d '\r\n' | xargs || echo "0")
        if [[ "$incomplete_count" -gt 0 ]]; then
            has_todos=true
        elif grep -q -E '^\s*#\s*TODO:|^\s*//\s*TODO:' "$todo_path" 2>/dev/null; then
            has_todos=true
        fi
    fi

    if [[ "$deferred_todo_count" -gt 0 ]]; then
        log_info "Deferred TODOs (not blocking completion): $deferred_todo_count"
    fi
    log_debug "Completion check: failing_count=$failing_count, has_todos=$has_todos, deferred_todos=$deferred_todo_count"

    if [[ "$failing_count" -eq 0 && "$has_todos" == false ]]; then
        log_info "Completion condition MET: failing_count=0 AND has_todos=false"
        return 0
    fi

    # Clean up stale completion markers when not complete
    log_debug "Project not complete: failing_count=$failing_count, has_todos=$has_todos"
    rm -f "$completed_marker" 2>/dev/null
    return 1
}

# -----------------------------------------------------------------------------
# Count Unfixed Audit Findings
# -----------------------------------------------------------------------------
# Usage: count_unfixed_audit_findings <metadata_dir>
# Outputs: count of audit-sourced features where passes != true (stdout)
# Returns: 0 if findings exist, 1 if none
count_unfixed_audit_findings() {
    local metadata_dir="$1"
    local features_dir="$metadata_dir/${DEFAULT_FEATURES_DIR}"

    if [[ ! -d "$features_dir" ]]; then
        echo "0"
        return 1
    fi

    local count=0
    while IFS= read -r feature_file; do
        [[ -z "$feature_file" || ! -f "$feature_file" ]] && continue
        local dir_name
        dir_name=$(basename "$(dirname "$feature_file")")
        # Audit findings have directory names starting with "audit-"
        if [[ "$dir_name" == audit-* ]]; then
            local passes
            passes=$(jq -r '.passes // false' "$feature_file" 2>/dev/null || echo "false")
            if [[ "$passes" != "true" ]]; then
                count=$((count + 1))
            fi
        fi
    done < <(ls -1 "$features_dir"/*/feature.json 2>/dev/null)

    echo "$count"
    if [[ $count -gt 0 ]]; then
        return 0
    fi
    return 1
}

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
    # Pattern 1: Standard markdown checkbox: - [ ] but NOT deferred - [~] or - [!]
    # Pattern 2: TODO comments with content: # TODO: or // TODO: (not headers like "# TODO List")
    if grep -q -E '^\s*-\s*\[\s*\]' "$todo_path" 2>/dev/null; then
        log_debug "Found incomplete markdown checkbox TODOs, continuing"
        return 1
    elif grep -q -E '^\s*#\s*TODO:|^\s*//\s*TODO:' "$todo_path" 2>/dev/null; then
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
                # Skip features excluded by --filter-by / --filter
                feature_matches_filter "$feature_file" || continue
                local status=$(jq -r '.status // ""' "$feature_file" 2>/dev/null)
                if [[ "$status" == "in_progress" ]]; then
                    in_progress_count=$((in_progress_count + 1))
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
        # Fallback to grep (filter not applied — jq required for filtering)
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
    # Check both local and UTC dates — LLMs may use either depending on
    # their system clock, and they can differ when running after UTC midnight
    if [[ -d "$audit_reports_dir" ]]; then
        local local_date utc_date
        local_date=$(date +%Y-%m-%d)
        utc_date=$(date -u +%Y-%m-%d)
        if ls "$audit_reports_dir"/${AUDIT_NAME}*${local_date}*.md >/dev/null 2>&1 || \
           ls "$audit_reports_dir"/${AUDIT_NAME}*${utc_date}*.md >/dev/null 2>&1; then
            log_debug "Audit report found for $AUDIT_NAME"
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
