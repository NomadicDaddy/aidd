#!/bin/bash
# =============================================================================
# lib/log-cleaner.sh - Log Cleaning Functionality for AIDD
# =============================================================================
# Pure bash implementation of log cleaning (replaces clean-logs.js)
# Removes ANSI codes, terminal artifacts, and cleans up log files

# Source utilities for logging
source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

# -----------------------------------------------------------------------------
# Log Cleanup Function
# -----------------------------------------------------------------------------

# Main cleanup function (for use by aidd.sh)
# Usage: cleanup_iteration_logs <iterations_dir> [--no-backup]
# Returns: 0 on success
cleanup_iteration_logs() {
    local iterations_dir="$1"
    local no_backup_flag=""

    # Check for --no-backup flag
    if [[ "$2" == "--no-backup" ]]; then
        no_backup_flag="--no-backup"
    fi

    if [[ ! -d "$iterations_dir" ]]; then
        log_debug "Iterations directory does not exist: $iterations_dir"
        return 0
    fi

    if [[ -z "$(ls -A "$iterations_dir" 2>/dev/null)" ]]; then
        log_debug "Iterations directory is empty: $iterations_dir"
        return 0
    fi

    log_info "Cleaning iteration logs..."

    # Find all .log files
    local log_files=()
    while IFS= read -r -d '' file; do
        log_files+=("$file")
    done < <(find "$iterations_dir" -maxdepth 1 -name "*.log" -type f -print0 | sort -z)

    if [[ ${#log_files[@]} -eq 0 ]]; then
        log_debug "No .log files found in $iterations_dir"
        return 0
    fi

    log_debug "Found ${#log_files[@]} log files"

    # Process each file
    local success_count=0
    local fail_count=0
    local esc=$(printf '\033')
    local bel=$(printf '\007')

    for file in "${log_files[@]}"; do
        log_debug "Processing: $file"

        # Create backup if requested
        if [[ "$no_backup_flag" != "--no-backup" ]]; then
            local backup_path="${file}.backup"
            cp "$file" "$backup_path"
            log_debug "  Created backup: $backup_path"
        fi

        # Clean content using sed/awk pipeline
        local cleaned_content
        cleaned_content=$(cat "$file" | \
            # Remove ANSI escape sequences
            sed "s/${esc}\[[0-?]*[ -/]*[@-~]//g" | \
            sed "s/${esc}\[?[0-9]*[hl]//g" | \
            sed "s/${esc}[=>]//g" | \
            sed "s/${esc}(B//g" | \
            sed "s/${esc}[\x40-\x5F]//g" | \
            sed "s/${bel}//g" | \
            # Remove terminal title changes
            sed "s/]0;[^${bel}]*[${bel}]//g" | \
            sed 's/0;[^-]*-\s*//g' | \
            # Remove box drawing characters
            sed '/^[┌│└┘├┤┬┴┼─[:space:]]*$/d' | \
            sed '/Group[[:space:]]*|[[:space:]]*Tools/,/└──────────┴───────────────────────────────────────────────────────────────────┘/d' | \
            sed '/┌────────────────────────────────────────────────────────────────────────┐/d' | \
            sed 's/   │//g' | \
            sed '/^[┌│└┘├┤┬┴┼─]\+$/d' | \
            # Remove duplicate consecutive lines
            awk '!seen[$0]++' | \
            # Remove whitespace-only lines
            sed '/^[[:space:]]*$/d' | \
            # Clean trailing whitespace
            sed 's/[[:space:]]\+$//' | \
            # Remove excessive empty lines
            cat -s)

        # Write cleaned content
        echo "$cleaned_content" > "$file"

        ((success_count++))
        log_debug "  Cleaned: $file"
    done

    log_debug "Processed ${success_count} files successfully"
    if [[ $fail_count -gt 0 ]]; then
        log_warn "Failed to process ${fail_count} files"
    fi

    log_info "Log cleanup complete"
    return 0
}
