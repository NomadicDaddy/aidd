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

    # Check if .aidd directory exists
    if [[ -d "$dir/$DEFAULT_METADATA_DIR" ]]; then
        echo "$dir/$DEFAULT_METADATA_DIR"
        return 0
    fi

    # Migrate legacy metadata directories into .aidd (read-only fallback)
    # Check CLI-specific legacy directory first (set by cli-factory.sh)
    if [[ -n "$CLI_LEGACY_METADATA_DIR" && -d "$dir/$CLI_LEGACY_METADATA_DIR" ]]; then
        local legacy="$dir/$CLI_LEGACY_METADATA_DIR"
        local target="$dir/$DEFAULT_METADATA_DIR"
        mkdir -p "$target"

        # Safely copy legacy metadata files
        for item in "$legacy"/*; do
            if [[ -e "$item" ]]; then
                local basename=$(basename "$item")
                if ! safe_copy "$item" "$target/$basename" "$dir"; then
                    log_warn "Failed to migrate: $basename"
                fi
            fi
        done

        log_info "Migrated legacy metadata from $CLI_LEGACY_METADATA_DIR to $DEFAULT_METADATA_DIR"
        echo "$target"
        return 0
    fi

    # Check generic automaker legacy directory
    if [[ -d "$dir/$LEGACY_METADATA_DIR_AUTOMAKER" ]]; then
        log_info "Using legacy metadata directory: $LEGACY_METADATA_DIR_AUTOMAKER"
        echo "$dir/$LEGACY_METADATA_DIR_AUTOMAKER"
        return 0
    fi

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
        ! -name '.auto' \
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
# Artifact Management Functions
# -----------------------------------------------------------------------------

# Copy artifacts to metadata directory
# Usage: copy_artifacts <project_dir> <script_dir>
# Returns: 0 on success
copy_artifacts() {
    local project_dir="$1"
    local script_dir="$2"
    local project_metadata_dir

    project_metadata_dir=$(find_or_create_metadata_dir "$project_dir")

    log_info "Copying artifacts to '$project_metadata_dir'..."
    mkdir -p "$project_metadata_dir"

    # Copy all artifacts contents, but don't overwrite existing files
    for artifact in "$script_dir/artifacts"/*; do
        if [[ -e "$artifact" ]]; then
            local basename
            basename=$(basename "$artifact")
            if [[ ! -e "$project_metadata_dir/$basename" ]]; then
                if safe_copy "$artifact" "$project_metadata_dir/$basename" "$project_dir"; then
                    log_debug "Copied artifact: $basename"
                else
                    log_warn "Failed to copy artifact: $basename"
                fi
            else
                log_debug "Artifact already exists, skipping: $basename"
            fi
        fi
    done

    return 0
}
