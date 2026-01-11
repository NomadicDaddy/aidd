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

# Helper function to migrate legacy metadata to .aidd
# Usage: migrate_legacy_metadata <project_dir> <legacy_dir_name>
# Returns: 0 on success, 1 on failure
migrate_legacy_metadata() {
    local dir="$1"
    local legacy_name="$2"
    local legacy="$dir/$legacy_name"
    local target="$dir/$DEFAULT_METADATA_DIR"

    mkdir -p "$target"
    log_info "Migrating legacy metadata from $legacy_name to $DEFAULT_METADATA_DIR"

    # Safely copy legacy metadata files
    for item in "$legacy"/*; do
        if [[ -e "$item" ]]; then
            local basename=$(basename "$item")
            if ! safe_copy "$item" "$target/$basename" "$dir"; then
                log_warn "Failed to migrate: $basename"
            fi
        fi
    done

    log_info "Migration complete. Using $DEFAULT_METADATA_DIR (legacy $legacy_name will not be modified)"
    return 0
}

# Find or create metadata directory
# Usage: find_or_create_metadata_dir <project_dir>
# Returns: Path to metadata directory
find_or_create_metadata_dir() {
    local dir="$1"

    # Check if .aidd directory exists
    if [[ -d "$dir/$DEFAULT_METADATA_DIR" ]]; then
        echo "$dir/$DEFAULT_METADATA_DIR"
        return 0
    fi

    # Check for legacy directories and migrate them
    # Priority: CLI-specific legacy first, then generic automaker
    local legacy_dirs=()

    # Add CLI-specific legacy directory if set
    if [[ -n "$CLI_LEGACY_METADATA_DIR" ]]; then
        legacy_dirs+=("$CLI_LEGACY_METADATA_DIR")
    fi

    # Add generic legacy directories
    legacy_dirs+=("$LEGACY_METADATA_DIR_AUTOMAKER")

    # Check each legacy directory in priority order
    for legacy_name in "${legacy_dirs[@]}"; do
        if [[ -d "$dir/$legacy_name" ]]; then
            migrate_legacy_metadata "$dir" "$legacy_name"
            echo "$dir/$DEFAULT_METADATA_DIR"
            return 0
        fi
    done

    # Create new .aidd directory
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
        ! -name '.autoo' \
        ! -name '.autok' \
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
