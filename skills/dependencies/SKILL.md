---
name: dependencies
description: 'Document the purpose, usage, necessity, and security/bundle impact of every project dependency in docs/dependencies.md. Use to audit, document, or review dependencies, or find unused or missing packages.'
metadata:
    aidd-category: metadata
---

# Dependency Analysis

Generate comprehensive dependency analysis documenting purpose, usage, and necessity of all project dependencies.

## Usage

```
dependencies
```

## Instructions

1. **Examine package files**:
    - Read `package.json` for production and development dependencies
    - Identify all version specifications and ranges
    - Note peer dependencies and optional dependencies
    - Count total dependencies

2. **Analyze codebase usage** for each dependency:
    - Find all imports and usage locations
    - Determine actual usage patterns (direct import, configuration, build process)
    - Assess if used in core functionality or peripheral features
    - List specific files and components that depend on it

3. **Categorize dependencies**:
    - Classify by necessity: Essential, High, Medium, Low priority
    - Group by category: Framework, build tools, styling, testing, etc.
    - Separate runtime vs development dependencies
    - Assess replaceability difficulty

4. **Document each dependency**:
    - Purpose: What problem it solves
    - Specific usage: Concrete examples from codebase with file references
    - Configuration: Special setup required
    - Integration points: How it connects with other dependencies

5. **Generate documentation** (`docs/dependencies.md`):
    - Production Dependencies (grouped by category): Core Framework, Backend & Data, UI & Styling, UX, Security & Auth
    - Development Dependencies (grouped by category): Build Tools, CSS Framework, TypeScript, Code Quality, Testing, Dev Tools
    - Dependency Usage Summary grouped by criticality
    - Recommendations: keep, replace, or remove
    - Security Assessment: known vulnerabilities
    - Performance Impact: bundle size, runtime effects

    Write the documentation prose to the humanize-docs skill's style contract (apply the
    humanize-docs skill to drafted prose before saving): plain natural language, no em-dashes,
    no AI filler (delve, leverage, robust, seamless). Package names, versions, and file
    references stay exact.

6. **Validate completeness**:
    - Verify every package.json dependency is documented
    - Cross-reference all imports to their dependencies
    - Confirm version numbers match current package.json
    - Check for orphaned dependencies (listed but unused)
    - Check for missing dependencies (used but not listed)

7. **Security and performance assessment**:
    - Check for known vulnerabilities
    - Assess bundle size impact of major dependencies
    - Note any performance implications

8. **Report completion**:
    - Provide path to generated documentation
    - Summarize total dependencies analyzed
    - Highlight critical findings or recommendations
