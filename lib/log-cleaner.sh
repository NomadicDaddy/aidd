#!/bin/bash
# =============================================================================
# lib/log-cleaner.sh - Log Cleaning Functionality for AIDD
# =============================================================================
# Pure bash implementation of log cleaning (replaces clean-logs.js)
# Removes ANSI codes, terminal artifacts, and cleans up log files

# Source utilities for logging
source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

# -----------------------------------------------------------------------------
# Log Cleaning Functions
# -----------------------------------------------------------------------------

# Clean log content (in-place string processing)
# Usage: clean_log_content <input_string>
# Returns: Cleaned string on stdout
clean_log_content() {
    local content="$1"

    # Remove ANSI escape sequences (comprehensive)
    # ESC [ ... m (SGR - colors, styles)
    content=$(echo "$content" | sed $'s/\x1b\[[0-?]*[ -/]*[@-~]//g')
    # ESC [ ? ... h/l (private mode set/reset)
    content=$(echo "$content" | sed $'s/\x1b\[?[0-9]*[hl]//g')
    # ESC = and ESC > (keypad modes)
    content=$(echo "$content" | sed $'s/\x1b[=>]//g')
    # ESC followed by single character
    content=$(echo "$content" | sed $'s/\x1b(B//g')
    content=$(echo "$content" | sed $'s/\x1b[\x40-\x5F]//g')
    # Bell character
    content=$(echo "$content" | sed $'s/\x07//g')

    # Remove terminal title changes
    # OSC sequences: ]0;...BEL or ]0;...LF
    content=$(echo "$content" | sed $'s/\]0;[^\x07\n]*[\x07\n]//g')
    content=$(echo "$content" | sed 's/0;[^-\n]*-\s*//g')

    # Remove box drawing characters and table borders
    # Unicode box drawing: ┌│└┘├┤┬┴┼─
    content=$(echo "$content" | sed '/^[┌│└┘├┤┬┴┼─[:space:]]*$/d')

    # Remove tool availability table artifacts
    content=$(echo "$content" | sed '/Group[[:space:]]*|[[:space:]]*Tools/,/└──────────┴───────────────────────────────────────────────────────────────────┘/d')

    # Remove specific table borders
    content=$(echo "$content" | sed '/┌────────────────────────────────────────────────────────────────────────┐/d')
    content=$(echo "$content" | sed 's/   │//g')

    # Remove any remaining standalone border lines
    content=$(echo "$content" | sed '/^[┌│└┘├┤┬┴┼─]\+$/d')

    # Remove duplicate consecutive lines
    content=$(echo "$content" | awk '!seen[$0]++')

    # Remove lines with only whitespace
    content=$(echo "$content" | sed '/^[[:space:]]*$/d')

    # Clean up trailing whitespace
    content=$(echo "$content" | sed 's/[[:space:]]\+$//')

    # Remove excessive consecutive empty lines (max 2 newlines = 1 blank line)
    content=$(echo "$content" | cat -s)

    # Trim beginning and end
    content=$(echo "$content" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')

    echo "$content"
}

# Clean a single log file
# Usage: clean_log_file <file_path> [--no-backup]
# Returns: 0 on success, 1 on failure
clean_log_file() {
    local file_path="$1"
    local no_backup=false

    # Check for --no-backup flag
    if [[ "$2" == "--no-backup" ]]; then
        no_backup=true
    fi

    # Validate file exists
    if [[ ! -f "$file_path" ]]; then
        log_error "File not found: $file_path"
        return 1
    fi

    # Validate it's a .log file
    if [[ ! "$file_path" =~ \.log$ ]]; then
        log_error "Not a .log file: $file_path"
        return 1
    fi

    log_debug "Processing: $file_path"

    # Read original file
    local original_content
    original_content=$(cat "$file_path")
    local original_size=${#original_content}

    # Create backup if requested
    if [[ "$no_backup" == false ]]; then
        local backup_path="${file_path}.backup"
        cp "$file_path" "$backup_path"
        log_debug "  Created backup: $backup_path"
    fi

    # Clean content using sed/awk pipeline
    local cleaned_content
    cleaned_content=$(cat "$file_path" | \
        # Remove ANSI escape sequences
        sed $'s/\x1b\[[0-?]*[ -/]*[@-~]//g' | \
        sed $'s/\x1b\[?[0-9]*[hl]//g' | \
        sed $'s/\x1b[=>]//g' | \
        sed $'s/\x1b(B//g' | \
        sed $'s/\x1b[\x40-\x5F]//g' | \
        sed $'s/\x07//g' | \
        # Remove terminal title changes
        sed $'s/\]0;[^\x07\n]*[\x07\n]//g' | \
        sed 's/0;[^-\n]*-\s*//g' | \
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
    echo "$cleaned_content" > "$file_path"

    local cleaned_size=${#cleaned_content}
    local reduction=0
    if [[ $original_size -gt 0 ]]; then
        reduction=$(( (original_size - cleaned_size) * 100 / original_size ))
    fi

    log_debug "  Cleaned: $file_path"
    log_debug "  Size reduction: $original_size → $cleaned_size bytes (${reduction}% smaller)"

    return 0
}

# Clean all log files in a directory
# Usage: clean_log_directory <dir_path> [--no-backup]
# Returns: 0 on success, 1 on failure
clean_log_directory() {
    local dir_path="$1"
    local no_backup_flag=""

    # Check for --no-backup flag
    if [[ "$2" == "--no-backup" ]]; then
        no_backup_flag="--no-backup"
    fi

    # Validate directory exists
    if [[ ! -d "$dir_path" ]]; then
        log_error "Directory not found: $dir_path"
        return 1
    fi

    log_debug "Scanning directory: $dir_path"

    # Find all .log files
    local log_files=()
    while IFS= read -r -d '' file; do
        log_files+=("$file")
    done < <(find "$dir_path" -maxdepth 1 -name "*.log" -type f -print0 | sort -z)

    if [[ ${#log_files[@]} -eq 0 ]]; then
        log_debug "No .log files found in $dir_path"
        return 0
    fi

    log_debug "Found ${#log_files[@]} log files"

    # Process each file
    local success_count=0
    local fail_count=0

    for file in "${log_files[@]}"; do
        if clean_log_file "$file" $no_backup_flag; then
            ((success_count++))
        else
            ((fail_count++))
        fi
    done

    log_debug "Processed ${success_count} files successfully"
    if [[ $fail_count -gt 0 ]]; then
        log_warn "Failed to process ${fail_count} files"
    fi

    return 0
}

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
    clean_log_directory "$iterations_dir" $no_backup_flag
    log_info "Log cleanup complete"

    return 0
}
