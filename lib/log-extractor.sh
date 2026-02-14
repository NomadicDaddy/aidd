#!/bin/bash
set -euo pipefail
# =============================================================================
# lib/log-extractor.sh - Structured Log Extraction for AIDD
# =============================================================================
# Extracts structured JSON from iteration logs
# Creates ###.json files with comprehensive iteration data

# Source utilities for logging
source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# Structured log output suffix
: "${STRUCTURED_LOG_SUFFIX:=".json"}"

# -----------------------------------------------------------------------------
# Extract iteration number from log file
# Usage: extract_iteration_number <log_file>
# Output: Integer iteration number
# -----------------------------------------------------------------------------
extract_iteration_number() {
    local log_file="$1"

    # Match patterns like "Iteration 1" or "Iteration 1 of 30"
    local iter_num
    iter_num=$(grep -oP 'Iteration\s+\K\d+' "$log_file" | head -1)

    if [[ -z "$iter_num" ]]; then
        # Fallback: extract from filename (e.g., 001.log -> 1)
        local basename
        basename=$(basename "$log_file" .log)
        iter_num=$((10#$basename))  # Remove leading zeros
    fi

    echo "${iter_num:-0}"
}

# -----------------------------------------------------------------------------
# Extract timestamps from log file
# Usage: extract_timestamps <log_file>
# Output: JSON object with start, end, durationSeconds
# -----------------------------------------------------------------------------
extract_timestamps() {
    local log_file="$1"

    local start_time
    local end_time

    # Extract start timestamp: [INFO] Started: 2026-01-10T12:44:14-06:00
    start_time=$(grep -oP '\[INFO\]\s+Started:\s+\K[^\s]+' "$log_file" | head -1)

    # Extract end timestamp: [INFO] Finished: 2026-01-10T13:04:21-06:00
    end_time=$(grep -oP '\[INFO\]\s+Finished:\s+\K[^\s]+' "$log_file" | tail -1)

    # Calculate duration if both timestamps exist
    local duration_seconds="null"
    if [[ -n "$start_time" && -n "$end_time" ]]; then
        local start_epoch
        local end_epoch
        # Convert to epoch seconds (works on GNU date)
        start_epoch=$(date -d "$start_time" +%s 2>/dev/null) || start_epoch=""
        end_epoch=$(date -d "$end_time" +%s 2>/dev/null) || end_epoch=""

        if [[ -n "$start_epoch" && -n "$end_epoch" ]]; then
            duration_seconds=$((end_epoch - start_epoch))
        fi
    fi

    # Build JSON
    jq -n \
        --arg start "${start_time:-null}" \
        --arg end "${end_time:-null}" \
        --argjson duration "$duration_seconds" \
        '{
            start: (if $start == "null" then null else $start end),
            end: (if $end == "null" then null else $end end),
            durationSeconds: $duration
        }'
}

# -----------------------------------------------------------------------------
# Extract prompt type from log file
# Usage: extract_prompt_type <log_file>
# Output: String (onboarding|initializer|coding|directive|todo|validate)
# -----------------------------------------------------------------------------
extract_prompt_type() {
    local log_file="$1"

    # Look for pattern: [INFO] Sending coding prompt to OpenCode...
    local prompt_type
    prompt_type=$(grep -oP '\[INFO\]\s+Sending\s+\K\w+(?=\s+prompt)' "$log_file" | head -1)

    echo "${prompt_type:-coding}"
}

# -----------------------------------------------------------------------------
# Extract CLI info from log file
# Usage: extract_cli_info <log_file>
# Output: JSON object with type and name
# -----------------------------------------------------------------------------
extract_cli_info() {
    local log_file="$1"

    # Look for pattern: [INFO] Sending coding prompt to OpenCode...
    local cli_name
    cli_name=$(grep -oP '\[INFO\]\s+Sending\s+\w+\s+prompt\s+to\s+\K\w+' "$log_file" | head -1)

    # Determine CLI type from name
    local cli_type
    case "$cli_name" in
        OpenCode) cli_type="opencode" ;;
        KiloCode) cli_type="kilocode" ;;
        Claude|ClaudeCode) cli_type="claude-code" ;;
        *) cli_type="unknown" ;;
    esac

    jq -n \
        --arg type "$cli_type" \
        --arg name "${cli_name:-unknown}" \
        '{ type: $type, name: $name }'
}

# -----------------------------------------------------------------------------
# Parse tool calls from log file
# Usage: parse_tool_calls <log_file>
# Output: JSON array of tool call objects
# -----------------------------------------------------------------------------
parse_tool_calls() {
    local log_file="$1"

    local tool_calls="[]"
    local line_num=0

    while IFS= read -r line; do
        line_num=$((line_num + 1))

        # Match pattern: |  ToolName     args
        if [[ "$line" =~ ^\|[[:space:]]+([A-Za-z]+)[[:space:]]+(.*)$ ]]; then
            local tool="${BASH_REMATCH[1]}"
            local target="${BASH_REMATCH[2]}"

            # Clean up target (remove trailing whitespace)
            target=$(echo "$target" | sed 's/[[:space:]]*$//')

            # Add to array
            tool_calls=$(echo "$tool_calls" | jq \
                --arg tool "$tool" \
                --arg target "$target" \
                --argjson lineNum "$line_num" \
                '. + [{ tool: $tool, target: $target, lineNumber: $lineNum }]')
        fi
    done < "$log_file"

    echo "$tool_calls"
}

# -----------------------------------------------------------------------------
# Extract files modified/read/created from tool calls
# Usage: extract_file_operations <tool_calls_json>
# Output: JSON object with filesModified, filesRead, filesCreated arrays
# -----------------------------------------------------------------------------
extract_file_operations() {
    local tool_calls_json="$1"

    # Extract files by tool type
    local files_modified
    local files_read
    local files_created

    files_modified=$(echo "$tool_calls_json" | jq -r '[.[] | select(.tool == "Edit") | .target] | unique')
    files_read=$(echo "$tool_calls_json" | jq -r '[.[] | select(.tool == "Read") | .target] | unique')
    files_created=$(echo "$tool_calls_json" | jq -r '[.[] | select(.tool == "Write") | .target] | unique')

    jq -n \
        --argjson modified "$files_modified" \
        --argjson read "$files_read" \
        --argjson created "$files_created" \
        '{
            filesModified: $modified,
            filesRead: $read,
            filesCreated: $created
        }'
}

# -----------------------------------------------------------------------------
# Extract bash commands from tool calls
# Usage: extract_commands <tool_calls_json>
# Output: JSON array of command objects
# -----------------------------------------------------------------------------
extract_commands() {
    local tool_calls_json="$1"

    echo "$tool_calls_json" | jq '[.[] | select(.tool == "Bash") | { command: .target, lineNumber: .lineNumber, exitCode: null }]'
}

# -----------------------------------------------------------------------------
# Determine outcome from log file
# Usage: determine_outcome <log_file>
# Output: JSON object with status, exitCode, failureCount
# -----------------------------------------------------------------------------
determine_outcome() {
    local log_file="$1"

    local status="success"
    local exit_code=0
    local failure_count=0

    # Check for failure patterns
    # Pattern: [WARN] OpenCode failed (exit=124); this is failure #1
    if grep -qP '\[WARN\].*failed.*exit=(\d+)' "$log_file"; then
        status="failure"
        exit_code=$(grep -oP '\[WARN\].*failed.*exit=\K\d+' "$log_file" | tail -1)
        failure_count=$(grep -oP 'this is failure #\K\d+' "$log_file" | tail -1)

        # Determine specific failure type
        case "$exit_code" in
            124) status="timeout" ;;
            70) status="no_assistant" ;;
            71) status="idle_timeout" ;;
            72) status="provider_error" ;;
            74) status="rate_limited" ;;
            *) status="failure" ;;
        esac
    fi

    # Check for project completion
    if grep -q 'Project completion CONFIRMED' "$log_file"; then
        status="success"
        exit_code=0
    fi

    jq -n \
        --arg status "$status" \
        --argjson exitCode "${exit_code:-0}" \
        --argjson failureCount "${failure_count:-0}" \
        '{
            status: $status,
            exitCode: $exitCode,
            failureCount: $failureCount
        }'
}

# -----------------------------------------------------------------------------
# Extract feature slug from log content
# Usage: extract_feature_slug <log_file> <metadata_dir>
# Output: Feature slug string or empty
# -----------------------------------------------------------------------------
extract_feature_slug() {
    local log_file="$1"
    local metadata_dir="$2"

    local feature_slug=""
    local feature_description=""

    # Method 1: Look for Edit operations on feature_list.json or feature.json
    # that contain in_progress status changes
    if grep -q 'Edit.*feature' "$log_file"; then
        # Try to find feature id being modified
        feature_slug=$(grep -oP '"id":\s*"\K[^"]+' "$log_file" | head -1)
    fi

    # Method 2: Look for feature directory references
    if [[ -z "$feature_slug" ]]; then
        # Pattern: .automaker/features/feature-slug/feature.json
        feature_slug=$(grep -oP '\.automaker/features/\K[^/]+(?=/feature\.json)' "$log_file" | head -1)
    fi

    # Method 3: Parse from "Sending X prompt" context if we have feature references
    if [[ -z "$feature_slug" && -d "$metadata_dir/features" ]]; then
        # Look for feature descriptions mentioned in log
        local desc_pattern
        for feature_dir in "$metadata_dir/features"/*/; do
            if [[ -f "${feature_dir}feature.json" ]]; then
                local feat_id
                feat_id=$(jq -r '.id // empty' "${feature_dir}feature.json" 2>/dev/null)
                local feat_desc
                feat_desc=$(jq -r '.description // empty' "${feature_dir}feature.json" 2>/dev/null)

                # Check if this feature is mentioned in the log
                if [[ -n "$feat_desc" ]] && grep -qF "$feat_desc" "$log_file"; then
                    feature_slug="$feat_id"
                    feature_description="$feat_desc"
                    break
                fi
            fi
        done
    fi

    # Output as JSON object with both slug and description
    jq -n \
        --arg slug "${feature_slug:-null}" \
        --arg desc "${feature_description:-null}" \
        '{
            slug: (if $slug == "null" then null else $slug end),
            description: (if $desc == "null" then null else $desc end)
        }'
}

# -----------------------------------------------------------------------------
# Extract errors from log file
# Usage: extract_errors <log_file>
# Output: JSON array of error objects
# -----------------------------------------------------------------------------
extract_errors() {
    local log_file="$1"

    local errors="[]"
    local line_num=0

    while IFS= read -r line; do
        line_num=$((line_num + 1))

        # Check for various error patterns
        if [[ "$line" =~ \[ERROR\] ]] || [[ "$line" =~ \[WARN\].*failed ]] || [[ "$line" =~ error: ]] || [[ "$line" =~ Error: ]]; then
            local error_type="general"
            local error_msg="$line"

            # Classify error type
            if [[ "$line" =~ lint|eslint|ESLint ]]; then
                error_type="lint"
            elif [[ "$line" =~ TS[0-9]+:|TypeScript|type.*error ]]; then
                error_type="typescript"
            elif [[ "$line" =~ build|Build|vite|webpack ]]; then
                error_type="build"
            elif [[ "$line" =~ timeout|Timeout ]]; then
                error_type="timeout"
            elif [[ "$line" =~ permission|Permission ]]; then
                error_type="permission"
            fi

            errors=$(echo "$errors" | jq \
                --arg type "$error_type" \
                --arg msg "$error_msg" \
                --argjson lineNum "$line_num" \
                '. + [{ type: $type, message: $msg, lineNumber: $lineNum }]')
        fi
    done < "$log_file"

    echo "$errors"
}

# -----------------------------------------------------------------------------
# Generate summary statistics
# Usage: generate_summary <tool_calls_json> <errors_json>
# Output: JSON object with summary stats
# -----------------------------------------------------------------------------
generate_summary() {
    local tool_calls_json="$1"
    local errors_json="$2"

    local total_tool_calls
    local unique_files_modified
    local unique_files_read
    local bash_commands_run
    local has_lint_errors
    local has_type_errors
    local has_build_errors

    total_tool_calls=$(echo "$tool_calls_json" | jq 'length')
    unique_files_modified=$(echo "$tool_calls_json" | jq '[.[] | select(.tool == "Edit") | .target] | unique | length')
    unique_files_read=$(echo "$tool_calls_json" | jq '[.[] | select(.tool == "Read") | .target] | unique | length')
    bash_commands_run=$(echo "$tool_calls_json" | jq '[.[] | select(.tool == "Bash")] | length')

    has_lint_errors=$(echo "$errors_json" | jq '[.[] | select(.type == "lint")] | length > 0')
    has_type_errors=$(echo "$errors_json" | jq '[.[] | select(.type == "typescript")] | length > 0')
    has_build_errors=$(echo "$errors_json" | jq '[.[] | select(.type == "build")] | length > 0')

    jq -n \
        --argjson totalToolCalls "$total_tool_calls" \
        --argjson uniqueFilesModified "$unique_files_modified" \
        --argjson uniqueFilesRead "$unique_files_read" \
        --argjson bashCommandsRun "$bash_commands_run" \
        --argjson hasLintErrors "$has_lint_errors" \
        --argjson hasTypeErrors "$has_type_errors" \
        --argjson hasBuildErrors "$has_build_errors" \
        '{
            totalToolCalls: $totalToolCalls,
            uniqueFilesModified: $uniqueFilesModified,
            uniqueFilesRead: $uniqueFilesRead,
            bashCommandsRun: $bashCommandsRun,
            hasLintErrors: $hasLintErrors,
            hasTypeErrors: $hasTypeErrors,
            hasBuildErrors: $hasBuildErrors
        }'
}

# -----------------------------------------------------------------------------
# Extract structured data from a single log file
# Usage: extract_structured_log <log_file> <metadata_dir> [output_file]
# Output: JSON to stdout or writes to output_file
# -----------------------------------------------------------------------------
extract_structured_log() {
    local log_file="$1"
    local metadata_dir="$2"
    local output_file="$3"

    if [[ ! -f "$log_file" ]]; then
        log_error "Log file does not exist: $log_file"
        return 1
    fi

    # Check jq dependency
    if ! command -v jq &> /dev/null; then
        log_error "jq is required for structured log extraction"
        return 1
    fi

    log_debug "Extracting structured data from: $log_file"

    # Extract all components
    local iteration_number
    iteration_number=$(extract_iteration_number "$log_file")

    local timestamps
    timestamps=$(extract_timestamps "$log_file")

    local prompt_type
    prompt_type=$(extract_prompt_type "$log_file")

    local cli_info
    cli_info=$(extract_cli_info "$log_file")

    local tool_calls
    tool_calls=$(parse_tool_calls "$log_file")

    local file_operations
    file_operations=$(extract_file_operations "$tool_calls")

    local commands
    commands=$(extract_commands "$tool_calls")

    local outcome
    outcome=$(determine_outcome "$log_file")

    local feature_info
    feature_info=$(extract_feature_slug "$log_file" "$metadata_dir")

    local errors
    errors=$(extract_errors "$log_file")

    local summary
    summary=$(generate_summary "$tool_calls" "$errors")

    # Build final JSON structure
    local structured_json
    structured_json=$(jq -n \
        --arg version "1.0" \
        --argjson iterationNumber "$iteration_number" \
        --argjson featureInfo "$feature_info" \
        --argjson cli "$cli_info" \
        --arg promptType "$prompt_type" \
        --argjson timestamps "$timestamps" \
        --argjson toolCalls "$tool_calls" \
        --argjson fileOps "$file_operations" \
        --argjson commands "$commands" \
        --argjson outcome "$outcome" \
        --argjson errors "$errors" \
        --argjson summary "$summary" \
        '{
            version: $version,
            iterationNumber: $iterationNumber,
            featureSlug: $featureInfo.slug,
            featureDescription: $featureInfo.description,
            cli: $cli,
            promptType: $promptType,
            timestamps: $timestamps,
            toolCalls: $toolCalls,
            filesModified: $fileOps.filesModified,
            filesRead: $fileOps.filesRead,
            filesCreated: $fileOps.filesCreated,
            commands: $commands,
            outcome: $outcome,
            errors: $errors,
            summary: $summary
        }')

    # Output or write to file
    if [[ -n "$output_file" ]]; then
        echo "$structured_json" > "$output_file"
        log_info "Structured log saved to: $output_file"
    else
        echo "$structured_json"
    fi

    return 0
}

# -----------------------------------------------------------------------------
# Extract structured logs from a single log file (convenience wrapper)
# Usage: extract_single_log <log_file> <metadata_dir>
# Creates: ###.json alongside the log file
# -----------------------------------------------------------------------------
extract_single_log() {
    local log_file="$1"
    local metadata_dir="$2"

    local output_file="${log_file%.log}${STRUCTURED_LOG_SUFFIX}"
    extract_structured_log "$log_file" "$metadata_dir" "$output_file"
}

# -----------------------------------------------------------------------------
# Batch process all log files in a directory
# Usage: extract_all_logs <iterations_dir> <metadata_dir> [output_dir]
# Creates: ###.json for each ###.log file
# -----------------------------------------------------------------------------
extract_all_logs() {
    local iterations_dir="$1"
    local metadata_dir="$2"
    local output_dir="${3:-$iterations_dir}"

    if [[ ! -d "$iterations_dir" ]]; then
        log_error "Iterations directory does not exist: $iterations_dir"
        return 1
    fi

    # Find all .log files
    local log_files=()
    while IFS= read -r -d '' file; do
        log_files+=("$file")
    done < <(find "$iterations_dir" -maxdepth 1 -name "*.log" -type f -print0 | sort -z)

    if [[ ${#log_files[@]} -eq 0 ]]; then
        log_info "No log files found in: $iterations_dir"
        return 0
    fi

    log_info "Processing ${#log_files[@]} log files..."

    local success_count=0
    local fail_count=0

    for log_file in "${log_files[@]}"; do
        local basename
        basename=$(basename "$log_file" .log)
        local output_file="$output_dir/${basename}${STRUCTURED_LOG_SUFFIX}"

        if extract_structured_log "$log_file" "$metadata_dir" "$output_file"; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
            log_warn "Failed to extract: $log_file"
        fi
    done

    log_info "Extracted $success_count structured logs ($fail_count failed)"
    return 0
}
