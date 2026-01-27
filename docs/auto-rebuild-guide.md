# Auto-Rebuild Guide

This guide documents the streamlined process for rebuilding spernakit-derived applications on a fresh template version using AIDD automation tools.

## Overview

The auto-rebuild process migrates an existing application to a fresh copy of the spernakit template while preserving all custom features. This ensures applications stay synchronized with template improvements while maintaining their unique functionality.

## Tools

The `tools/` directory contains automation scripts to expedite the rebuild process:

| Tool                   | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `diff-template.sh`     | Analyzes app vs template, generates DIFFERENTIATION.md |
| `generate-features.sh` | Creates feature.json files from DIFFERENTIATION.md     |
| `pre-rebuild-check.sh` | Pre-flight checklist before starting AIDD              |
| `audit-parity.sh`      | Post-rebuild feature parity verification               |

## Prerequisites

- Spernakit template at known location (e.g., `d:/applications/spernakit`)
- Backup of the original application
- `jq` installed (optional, improves JSON handling)

## Workflow

### Phase 1: Analysis

Generate the differentiation inventory by comparing the app against the template:

```bash
cd d:/applications/aidd

# Generate DIFFERENTIATION.md
./tools/diff-template.sh \
    --app d:/applications/myapp \
    --template d:/applications/spernakit \
    --verbose
```

Output: `myapp/docs/DIFFERENTIATION.md`

Review and refine the generated file:

- Fill in description placeholders
- Add any features not automatically detected
- Remove false positives (template files mistakenly flagged)
- Group related items logically

### Phase 2: Feature Generation

Generate feature files from the differentiation inventory:

```bash
# Create feature files
./tools/generate-features.sh \
    --input d:/applications/myapp/docs/DIFFERENTIATION.md \
    --output d:/applications/myapp/.automaker/features/
```

This creates one feature directory per item with:

- Proper feature IDs (`feature-YYYYMMDD-name`)
- Template-based acceptance criteria
- Auto-detected dependencies
- Appropriate priorities (models=1, crud=2, pages=3)

### Phase 3: Validation

Validate the generated features:

```bash
# Validate features
./aidd.sh --project-dir d:/applications/myapp --check-features
```

Checks:

- Valid JSON syntax
- Required fields present
- All dependencies exist

Fix any reported issues before proceeding.

### Phase 4: Pre-Rebuild Check

Run the pre-flight checklist:

```bash
./tools/pre-rebuild-check.sh \
    --app d:/applications/myapp \
    --original d:/applications/myapp-backup
```

This verifies:

- DIFFERENTIATION.md exists (in original/backup)
- Feature files are valid (in new app)
- No duplicate IDs
- Dependencies resolve

All checks must pass before starting AIDD.

### Phase 5: AIDD Execution

Start the rebuild with AIDD:

```bash
# Initialize fresh template copy (manual step)
# Copy spernakit template to new directory or reset existing

# Run AIDD
./aidd.sh \
    --cli claude-code \
    --project-dir d:/applications/myapp \
    --max-iterations 50
```

Monitor progress in `.automaker/iterations/` logs.

### Phase 6: Post-Rebuild Audit

After AIDD completes, verify feature parity:

```bash
./tools/audit-parity.sh \
    --original d:/applications/myapp-backup \
    --rebuilt d:/applications/myapp \
    --output parity-report.md
```

Address any missing items identified.

### Phase 7: Final Validation

Run the application's quality checks:

```bash
cd d:/applications/myapp
bun run smoke:qc
```

All checks must pass.

## Feature Templates

Templates in `tools/templates/` provide consistent acceptance criteria:

| Template               | Use Case            | Priority |
| ---------------------- | ------------------- | -------- |
| `model-feature.json`   | Database models     | 1        |
| `crud-feature.json`    | API CRUD operations | 2        |
| `page-feature.json`    | Frontend pages      | 3        |
| `widget-feature.json`  | Dashboard widgets   | 2        |
| `service-feature.json` | Backend services    | 2        |

Templates use placeholders:

- `{{ENTITY}}` - Entity name (e.g., "Backup")
- `{{ENTITY_LOWER}}` - Lowercase (e.g., "backup")
- `{{FEATURE_ID}}` - Generated feature ID
- `{{TIMESTAMP}}` - ISO timestamp
- `{{MODEL_DEPENDENCY}}` - Model feature dependency
- `{{CRUD_DEPENDENCY}}` - CRUD feature dependency

## Best Practices

### Feature Granularity

Use fine-grained features for better tracking:

- Separate model, CRUD, and page as distinct features
- Each feature should be independently verifiable
- Aim for 10-15 acceptance criteria per feature

### Dependencies

Follow the dependency chain:

```
model → crud → page
      ↘ service ↗
```

- Models have no dependencies (priority 1)
- CRUD depends on its model (priority 2)
- Pages depend on CRUD (priority 3)
- Services may depend on models or other services

### Naming Conventions

Use consistent naming:

- `{entity}-model` - Database model features
- `{entity}-crud` - CRUD API features
- `{entity}-page` or `{entities}-page` - Page features
- `{name}-widget` - Dashboard widgets
- `{name}-service` - Backend services

### Checkpoint Strategy

For large rebuilds, commit checkpoints after major milestones:

```bash
# After models complete
git add . && git commit -m "rebuild: models complete"

# After CRUD complete
git add . && git commit -m "rebuild: crud complete"

# After pages complete
git add . && git commit -m "rebuild: pages complete"
```

## Troubleshooting

### Missing Dependencies

If `--check-features` reports missing dependencies:

1. Check feature IDs match exactly
2. Verify the dependency feature file exists
3. Ensure DIFFERENTIATION.md has entries in both the model and route sections for related features

### Feature Generation Issues

If `generate-features.sh` misses items:

1. Ensure DIFFERENTIATION.md uses correct format: `- [ ] **Name** - description`
2. Check section headers match expected names
3. Run with `--dry-run --verbose` to debug

### AIDD Stalls

If AIDD iterations stall:

1. Check `.automaker/iterations/` for error logs
2. Verify feature specs are clear and unambiguous
3. Consider breaking complex features into smaller pieces

## Example: Rebuilding OpenPlanner

```bash
# 1. Backup original (preserve as reference)
cp -r d:/applications/openplanner d:/applications/openplanner.old

# 2. Analysis (on the backup)
./tools/diff-template.sh \
    --app d:/applications/openplanner.old \
    --template d:/applications/spernakit

# 3. Review and edit DIFFERENTIATION.md
code d:/applications/openplanner.old/docs/DIFFERENTIATION.md

# 4. Initialize fresh template copy
cp -r d:/applications/spernakit d:/applications/openplanner
# (or reset existing: rm -rf d:/applications/openplanner && cp -r ...)

# 5. Generate features (from backup's DIFFERENTIATION.md to new app)
./tools/generate-features.sh \
    --input d:/applications/openplanner.old/docs/DIFFERENTIATION.md \
    --output d:/applications/openplanner/.automaker/features/

# 6. Validate features
./aidd.sh --project-dir d:/applications/openplanner --check-features

# 7. Pre-check
./tools/pre-rebuild-check.sh \
    --app d:/applications/openplanner \
    --original d:/applications/openplanner.old

# 8. Run AIDD
./aidd.sh --cli claude-code --project-dir d:/applications/openplanner

# 9. Audit parity
./tools/audit-parity.sh \
    --original d:/applications/openplanner.old \
    --rebuilt d:/applications/openplanner

# 10. Final validation
cd d:/applications/openplanner && bun run smoke:qc
```

## Applications Queue

Applications to rebuild on spernakit v1.7.8:

| Order | Application   | Status  |
| ----- | ------------- | ------- |
| 1     | reportal      | Pending |
| 2     | skedman       | Pending |
| 3     | openplanner   | Pending |
| 4     | ottoboard     | Pending |
| 5     | tribewall     | Pending |
| 6     | synchronosity | Pending |
| 7     | syndicate85   | Pending |

**Note:** `deeper` (spernakit+pode) is excluded - requires separate handling due to PowerShell backend.
