---
name: dependencies
description: 'Document the purpose, usage, necessity, and security or performance impact of every declared direct project dependency in docs/dependencies.md. Use to audit or review dependencies, or find unused or missing packages.'
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Dependency Analysis

Document every declared direct dependency from the current project and its workspaces. Base the
analysis on source, configuration, lockfiles, and project-native checks instead of package names
alone.

## Usage

```text
dependencies [app]
```

- `[app]` - Application name or local path. If omitted, use the current repository.

## Instructions

1. **Resolve the project and manifests**:
    - Resolve `[app]` to one local project root and read its repository instructions.
    - Identify the package manager and every root or workspace manifest. For a Bun or Node project,
      this includes each applicable `package.json` and the lockfile.
    - Include production, development, peer, optional, bundled, override, and workspace
      declarations when present. Keep these declaration types distinct.
    - Record declared version specifications from manifests and resolved versions from the
      lockfile. Do not describe a range as the installed version.
    - Count unique direct external packages separately from local workspace packages. Do not count
      the same package twice merely because two workspaces declare it.

2. **Analyze usage** for each direct dependency:
    - Search imports, dynamic imports, scripts, configuration, plugins, type references, generated
      code, and command-line use.
    - Distinguish an external package from a runtime built-in, local module, or workspace package.
    - Record representative files and integration points. Do not dump every matching file when a
      few examples establish the usage.
    - Treat an apparently unused package as a finding only after checking indirect uses such as
      framework discovery, loaders, peer requirements, and package-manager lifecycle scripts.

3. **Classify each dependency**:
    - Group packages by their real role in the target, such as runtime framework, data, UI,
      security, build, test, or code quality. Do not force web-specific categories onto another
      stack.
    - Preserve the manifest boundary between runtime and development dependencies.
    - Give each dependency a recommendation of keep, replace, remove, or investigate, with evidence.
      Use `investigate` when necessity cannot be proved safely.
    - Note replacement difficulty only when it affects the recommendation.

4. **Assess security and performance**:
    - Run the repository's own dependency audit when it exists. Otherwise use the current package
      manager's non-mutating audit command when available. Report the command, result, and date.
    - Do not claim that a package has no known vulnerabilities when no current audit completed.
    - Use existing bundle analysis, build output, or runtime evidence for performance claims. Label
      bundle cost or runtime impact as unmeasured when the project has no relevant measurement.
    - Keep transitive vulnerability findings separate from the direct-dependency inventory, but
      connect each finding to its direct dependency chain when the audit provides that evidence.

5. **Create or update `docs/dependencies.md`**:
    - Preserve accurate project-specific material when the document already exists.
    - Identify the manifests, workspaces, lockfile, and counting method used.
    - Document each direct dependency with its declaration type, requested and resolved version,
      purpose, representative usage, configuration or integration details, and recommendation.
    - Summarize security evidence, performance evidence, duplicate or conflicting declarations,
      and actionable recommendations.
    - Record unresolved questions plainly rather than guessing.

    Write the documentation prose to the humanize-docs skill's style contract (apply the
    humanize-docs skill to drafted prose before saving): plain natural language, no em-dashes,
    no AI filler (delve, leverage, robust, seamless). Package names, versions, and file
    references stay exact.

6. **Validate the document**:
    - Reconcile the documented direct-dependency set against every applicable manifest.
    - Confirm requested versions against manifests and resolved versions against the lockfile.
    - Run project-native checks for dependency consistency and unused dependencies when present.
    - Investigate imports of undeclared external packages and declarations with no established use.
    - Run the repository's focused documentation or formatting check for the changed file.
    - Re-read the final diff and confirm that only `docs/dependencies.md` changed.

7. **Report completion**:
    - Provide the documentation path and unique direct external and workspace-package totals.
    - List the audit and validation commands with their actual pass, fail, or unavailable result.
    - Highlight remove, replace, investigate, vulnerability, and measured performance findings.
