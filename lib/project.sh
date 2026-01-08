#!/bin/bash
# =============================================================================
# lib/project.sh - Project Management Module for AIDD
# =============================================================================
# Functions for project initialization, metadata management, and scaffolding

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
    if [[ -d "$dir/$METADATA_DIR_NAME" ]]; then
        echo "$dir/$METADATA_DIR_NAME"
        return 0
    fi

    # Migrate legacy metadata directories into .aidd (read-only fallback)
    # Check CLI-specific legacy directory first (set by cli-factory.sh)
    if [[ -n "$CLI_LEGACY_METADATA_DIR" && -d "$dir/$CLI_LEGACY_METADATA_DIR" ]]; then
        local legacy="$dir/$CLI_LEGACY_METADATA_DIR"
        local target="$dir/$METADATA_DIR_NAME"
        mkdir -p "$target"
        cp -R "$legacy/." "$target/" 2>/dev/null || true
        log_info "Migrated legacy metadata from $CLI_LEGACY_METADATA_DIR to $METADATA_DIR_NAME"
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
    mkdir -p "$dir/$METADATA_DIR_NAME"
    log_debug "Created metadata directory: $dir/$METADATA_DIR_NAME"
    echo "$dir/$METADATA_DIR_NAME"
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
        ! -name "$METADATA_DIR_NAME" \
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

# Get project path (absolute path)
# Usage: get_project_path <project_dir>
# Returns: Absolute path to project directory
get_project_path() {
    local project_dir="$1"
    abs_path "$project_dir"
}

# Create project subdirectory
# Usage: create_subdir <project_dir> <subdir_name>
# Returns: 0 on success, 1 on failure
create_subdir() {
    local project_dir="$1"
    local subdir_name="$2"
    local full_path="$project_dir/$subdir_name"
    
    ensure_dir "$full_path"
    return $?
}

# List project directories (excluding metadata and common directories)
# Usage: list_project_dirs <project_dir>
# Returns: List of directories (one per line)
list_project_dirs() {
    local project_dir="$1"
    
    find "$project_dir" -mindepth 1 -maxdepth 1 -type d \
        ! -name '.git' \
        ! -name "$METADATA_DIR_NAME" \
        ! -name '.auto' \
        ! -name '.autok' \
        ! -name '.automaker' \
        ! -name 'node_modules' \
        ! -name '.vscode' \
        ! -name '.idea' \
        -printf "%f\n" 2>/dev/null | sort
}

# Get project statistics
# Usage: get_project_stats <project_dir>
# Returns: Formatted statistics string
get_project_stats() {
    local project_dir="$1"
    
    local file_count=$(find "$project_dir" -type f \
        ! -path '*/.git/*' \
        ! -path '*/node_modules/*' \
        ! -path "*/$METADATA_DIR_NAME/*" \
        ! -path '*/.vscode/*' \
        ! -path '*/.idea/*' \
        2>/dev/null | wc -l)
    
    local dir_count=$(find "$project_dir" -type d \
        ! -path '*/.git/*' \
        ! -path '*/node_modules/*' \
        ! -path "*/$METADATA_DIR_NAME/*" \
        ! -path '*/.vscode/*' \
        ! -path '*/.idea/*' \
        2>/dev/null | wc -l)
    
    echo "Files: $file_count, Directories: $dir_count"
}

# -----------------------------------------------------------------------------
# Project Initialization Functions
# -----------------------------------------------------------------------------

# Initialize project directory
# Usage: init_project <project_dir> <script_dir> <new_project_created_var>
# Returns: 0 on success, sets new_project_created_var to true/false
init_project() {
    local project_dir="$1"
    local script_dir="$2"
    local -n new_project_created_ref=$3
    
    # Ensure project directory exists
    if [[ ! -d "$project_dir" ]]; then
        log_info "Project directory '$project_dir' does not exist; creating it..."
        mkdir -p "$project_dir"
        new_project_created_ref=true
        
        # Copy scaffolding files to the new project directory (including hidden files)
        log_info "Copying scaffolding files to '$project_dir'..."
        find "$script_dir/scaffolding" -mindepth 1 -maxdepth 1 -exec cp -r {} "$project_dir/" \;
        
        return 0
    else
        # Check if this is an existing codebase
        if is_existing_codebase "$project_dir"; then
            log_info "Detected existing codebase in '$project_dir'"
        fi
        new_project_created_ref=false
        return 0
    fi
}

# Load specification file
# Usage: load_spec <spec_file> <metadata_dir>
# Returns: 0 on success, 1 on failure
load_spec() {
    local spec_file="$1"
    local metadata_dir="$2"
    local spec_path="$metadata_dir/$SPEC_FILE_NAME"
    
    # Check if spec file exists
    if [[ -n "$spec_file" && ! -f "$spec_file" ]]; then
        log_error "Spec file '$spec_file' does not exist"
        return 1
    fi
    
    # Copy spec file to project directory if provided
    if [[ -n "$spec_file" ]]; then
        log_debug "Copying spec file to '$spec_path'"
        cp "$spec_file" "$spec_path"
        return 0
    fi
    
    return 0
}

# Generate README for project
# Usage: generate_readme <project_dir> <spec_file>
# Returns: 0 on success
generate_readme() {
    local project_dir="$1"
    local spec_file="$2"
    local readme_path="$project_dir/README.md"
    
    # Only generate if README doesn't exist
    if [[ -f "$readme_path" ]]; then
        log_debug "README.md already exists, skipping generation"
        return 0
    fi
    
    log_info "Generating README.md..."
    
    cat > "$readme_path" << 'EOF'
# Project Name

## Description

This project was created using aidd-k (AI Development Driver: KiloCode).

## Getting Started

Add your getting started instructions here.

## Development

Add your development instructions here.

## License

Specify your license here.
EOF
    
    log_debug "Generated README.md at $readme_path"
    return 0
}

# Initialize git repository
# Usage: init_git <project_dir>
# Returns: 0 on success or if already initialized
init_git() {
    local project_dir="$1"
    local git_dir="$project_dir/.git"
    
    # Check if already initialized
    if [[ -d "$git_dir" ]]; then
        log_debug "Git repository already initialized"
        return 0
    fi
    
    # Check if git is available
    if ! command_exists git; then
        log_warn "Git not found, skipping git initialization"
        return 0
    fi
    
    log_info "Initializing git repository..."
    (cd "$project_dir" && git init) 2>/dev/null
    
    if [[ $? -eq 0 ]]; then
        log_debug "Git repository initialized successfully"
        return 0
    else
        log_warn "Failed to initialize git repository"
        return 1
    fi
}

# Create .gitignore file
# Usage: create_gitignore <project_dir>
# Returns: 0 on success
create_gitignore() {
    local project_dir="$1"
    local gitignore_path="$project_dir/.gitignore"
    
    # Only create if .gitignore doesn't exist
    if [[ -f "$gitignore_path" ]]; then
        log_debug ".gitignore already exists, skipping creation"
        return 0
    fi
    
    log_info "Creating .gitignore..."
    
    cat > "$gitignore_path" << 'EOF'
# Dependencies
node_modules/
vendor/

# Build outputs
dist/
build/
*.log

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Metadata
.aidd/
.auto/
.autok/
.automaker/

# Environment
.env
.env.local
.env.*.local
EOF
    
    log_debug "Created .gitignore at $gitignore_path"
    return 0
}

# Setup project (complete initialization)
# Usage: setup_project <project_dir> <script_dir> <spec_file> <new_project_created_var>
# Returns: 0 on success
setup_project() {
    local project_dir="$1"
    local script_dir="$2"
    local spec_file="$3"
    local -n new_project_created_ref=$4
    local metadata_dir
    
    # Initialize project directory
    init_project "$project_dir" "$script_dir" new_project_created_ref
    
    # Find or create metadata directory
    metadata_dir=$(find_or_create_metadata_dir "$project_dir")
    
    # Load spec if provided
    if [[ "$new_project_created_ref" == true ]]; then
        load_spec "$spec_file" "$metadata_dir"
    fi
    
    # Generate README
    generate_readme "$project_dir" "$spec_file"
    
    # Initialize git (optional)
    init_git "$project_dir"
    
    # Create .gitignore
    create_gitignore "$project_dir"
    
    return 0
}

# Validate project structure
# Usage: validate_project <project_dir>
# Returns: 0 if valid, 1 if invalid
validate_project() {
    local project_dir="$1"
    
    # Check if project directory exists
    if [[ ! -d "$project_dir" ]]; then
        log_error "Project directory does not exist: $project_dir"
        return 1
    fi
    
    # Check if metadata directory exists
    local metadata_dir="$project_dir/$METADATA_DIR"
    if [[ ! -d "$metadata_dir" ]]; then
        log_error "Metadata directory does not exist: $metadata_dir"
        return 1
    fi
    
    log_debug "Project structure validated successfully"
    return 0
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
                cp -r "$artifact" "$project_metadata_dir/"
                log_debug "Copied artifact: $basename"
            else
                log_debug "Artifact already exists, skipping: $basename"
            fi
        fi
    done
    
    return 0
}
