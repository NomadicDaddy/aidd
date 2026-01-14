#!/bin/bash
# =============================================================================
# lib/project.sh - Project Management Module for AIDD
# =============================================================================
# Functions for project metadata management and artifact copying

# Source configuration and utilities
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

# -----------------------------------------------------------------------------
# Project Directory Functions
# -----------------------------------------------------------------------------

# Find or create metadata directory
# Usage: find_or_create_metadata_dir <project_dir>
# Returns: Path to metadata directory
find_or_create_metadata_dir() {
    local dir="$1"

    # Check if .automaker directory exists
    if [[ -d "$dir/$DEFAULT_METADATA_DIR" ]]; then
        echo "$dir/$DEFAULT_METADATA_DIR"
        return 0
    fi

    # Create new .automaker directory
    mkdir -p "$dir/$DEFAULT_METADATA_DIR"
    log_debug "Created metadata directory: $dir/$DEFAULT_METADATA_DIR"
    echo "$dir/$DEFAULT_METADATA_DIR"
    return 0
}

# Check if directory is an existing codebase
# Usage: is_existing_codebase <dir>
# Returns: 0 if existing codebase, 1 if empty/new directory
is_existing_codebase() {
    local dir="$1"

    # Check if directory exists
    if [[ ! -d "$dir" ]]; then
        return 1
    fi

    # Find files/directories excluding common metadata and IDE directories
    local has_files=$(find "$dir" -mindepth 1 -maxdepth 1 \
        ! -name '.git' \
        ! -name "$DEFAULT_METADATA_DIR" \
        ! -name '.automaker' \
        ! -name '.DS_Store' \
        ! -name 'node_modules' \
        ! -name '.vscode' \
        ! -name '.idea' \
        -print -quit 2>/dev/null | wc -l)

    if [[ $has_files -gt 0 ]]; then
        return 0  # True - it's an existing codebase
    fi

    return 1  # False - empty or new directory
}

# -----------------------------------------------------------------------------
# Template Management Functions
# -----------------------------------------------------------------------------

# Copy templates to metadata directory
# Usage: copy_templates <project_dir> <script_dir>
# Returns: 0 on success
copy_templates() {
    local project_dir="$1"
    local script_dir="$2"
    local project_metadata_dir

    project_metadata_dir=$(find_or_create_metadata_dir "$project_dir")

    log_info "Copying templates to '$project_metadata_dir'..."
    mkdir -p "$project_metadata_dir"

    # Copy all templates contents, but don't overwrite existing files
    for template in "$script_dir/templates"/*; do
        if [[ -e "$artifact" ]]; then
            local basename
            basename=$(basename "$artifact")
            if [[ ! -e "$project_metadata_dir/$basename" ]]; then
                if safe_copy "$artifact" "$project_metadata_dir/$basename" "$project_dir"; then
                    log_debug "Copied template: $basename"
                else
                    log_warn "Failed to copy template: $basename"
                fi
            else
                log_debug "Template already exists, skipping: $basename"
            fi
        fi
    done

    return 0
}

# Copy shared directories to project
# Usage: copy_shared_directories <project_dir> <script_dir>
# Returns: 0 on success
# Reads copydirs.txt and copies listed directories to the target project
copy_shared_directories() {
    local project_dir="$1"
    local script_dir="$2"
    local copydirs_file="$script_dir/copydirs.txt"

    # Convert project_dir to absolute path to avoid rsync confusion
    project_dir="$(cd "$project_dir" && pwd)" || {
        log_error "Failed to resolve project directory: $1"
        return 1
    }

    # Check if copydirs.txt exists
    if [[ ! -f "$copydirs_file" ]]; then
        log_debug "No copydirs.txt found, skipping shared directory copy"
        return 0
    fi

    log_debug "Copying shared directories from copydirs.txt..."
    log_debug "Target project directory: $project_dir"
    local copied_count=0
    local skipped_count=0
    local failed_count=0

    # Read copydirs.txt line by line
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue

        # Trim leading and trailing whitespace
        local source_dir="${line#"${line%%[![:space:]]*}"}"
        source_dir="${source_dir%"${source_dir##*[![:space:]]}"}"

        # Check if source directory exists
        if [[ ! -d "$source_dir" ]]; then
            log_warn "Shared directory not found, skipping: $source_dir"
            ((skipped_count++))
            continue
        fi

        # Get directory basename
        local dir_name=$(basename "$source_dir")
        local target_path="$project_dir/$dir_name"

        log_debug "Syncing: $source_dir -> $target_path"

        # Copy directory (rsync preferred for efficiency, fallback to cp)
        if command -v rsync &> /dev/null; then
            # Use rsync for efficient directory copying (only updates changed files)
            # Exclude common directories and lock files that shouldn't be synced
            # --max-depth=10 prevents infinite recursion loops
            # --no-links prevents following symlinks
            if rsync -a --delete --max-depth=10 --no-links \
                --exclude='node_modules' \
                --exclude='.git' \
                --exclude='bun.lock' \
                --exclude='bun.lockb' \
                --exclude='package-lock.json' \
                --exclude='yarn.lock' \
                --exclude='pnpm-lock.yaml' \
                "$source_dir/" "$target_path/" 2>/dev/null; then
                log_debug "Synchronized shared directory: $dir_name"
                ((copied_count++))
            else
                log_warn "Failed to copy shared directory: $source_dir"
                ((failed_count++))
            fi
        else
            # Fallback to manual copy with exclusions
            if [[ -d "$target_path" ]]; then
                rm -rf "$target_path"
            fi
            mkdir -p "$target_path"

            # Use find to copy while excluding specific patterns
            if (cd "$source_dir" && find . -type f \
                ! -path '*/node_modules/*' \
                ! -path '*/.git/*' \
                ! -name 'bun.lock' \
                ! -name 'bun.lockb' \
                ! -name 'package-lock.json' \
                ! -name 'yarn.lock' \
                ! -name 'pnpm-lock.yaml' \
                -exec sh -c 'mkdir -p "'"$target_path"'/$(dirname "$1")" && cp "$1" "'"$target_path"'/$1"' _ {} \; 2>/dev/null); then
                log_debug "Copied shared directory (with exclusions): $dir_name"
                ((copied_count++))
            else
                log_warn "Failed to copy shared directory: $source_dir"
                ((failed_count++))
            fi
        fi
    done < "$copydirs_file"

    # Log summary
    if [[ $copied_count -gt 0 ]]; then
        log_info "Refreshed $copied_count shared director$([[ $copied_count -eq 1 ]] && echo "y" || echo "ies")"
    fi

    if [[ $failed_count -gt 0 ]]; then
        log_warn "Failed to copy $failed_count shared director$([[ $failed_count -eq 1 ]] && echo "y" || echo "ies")"
    fi

    return 0
}

# Copy shared files to project
# Usage: copy_shared_files <project_dir> <script_dir>
# Returns: 0 on success
# Reads copyfiles.txt and copies listed files to the target project
# Each line format: <source_path> [-> <target_path>]
# If target_path is omitted, file is placed in project root with same basename
copy_shared_files() {
    local project_dir="$1"
    local script_dir="$2"
    local copyfiles_file="$script_dir/copyfiles.txt"

    # Convert project_dir to absolute path
    project_dir="$(cd "$project_dir" && pwd)" || {
        log_error "Failed to resolve project directory: $1"
        return 1
    }

    # Check if copyfiles.txt exists
    if [[ ! -f "$copyfiles_file" ]]; then
        log_debug "No copyfiles.txt found, skipping shared file copy"
        return 0
    fi

    log_debug "Copying shared files from copyfiles.txt..."
    log_debug "Target project directory: $project_dir"
    local copied_count=0
    local skipped_count=0
    local failed_count=0

    # Read copyfiles.txt line by line
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue

        # Trim leading and trailing whitespace
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"

        # Parse source and optional target (format: source -> target)
        local source_file=""
        local target_rel=""

        if [[ "$line" == *" -> "* ]]; then
            # Custom target path specified
            source_file="${line%% -> *}"
            target_rel="${line##* -> }"
            # Trim whitespace from both
            source_file="${source_file%"${source_file##*[![:space:]]}"}"
            target_rel="${target_rel#"${target_rel%%[![:space:]]*}"}"
        else
            # No target specified, use basename in project root
            source_file="$line"
            target_rel="$(basename "$source_file")"
        fi

        # Check if source file exists
        if [[ ! -f "$source_file" ]]; then
            log_warn "Shared file not found, skipping: $source_file"
            ((skipped_count++))
            continue
        fi

        local target_path="$project_dir/$target_rel"
        local target_dir="$(dirname "$target_path")"

        log_debug "Copying: $source_file -> $target_path"

        # Create target directory if needed
        if [[ ! -d "$target_dir" ]]; then
            mkdir -p "$target_dir" 2>/dev/null || {
                log_warn "Failed to create directory: $target_dir"
                ((failed_count++))
                continue
            }
        fi

        # Copy file
        if cp -f "$source_file" "$target_path" 2>/dev/null; then
            log_debug "Copied shared file: $target_rel"
            ((copied_count++))
        else
            log_warn "Failed to copy shared file: $source_file"
            ((failed_count++))
        fi
    done < "$copyfiles_file"

    # Log summary
    if [[ $copied_count -gt 0 ]]; then
        log_info "Refreshed $copied_count shared file$([[ $copied_count -eq 1 ]] && echo "" || echo "s")"
    fi

    if [[ $failed_count -gt 0 ]]; then
        log_warn "Failed to copy $failed_count shared file$([[ $failed_count -eq 1 ]] && echo "" || echo "s")"
    fi

    return 0
}
