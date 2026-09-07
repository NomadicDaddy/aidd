---
name: spernakit-update-docs
description: 'Align the core Spernakit documentation, audit, fleet manifest, and workspace agent rules with the live template. Use to confirm or restore consistency before a template release.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: humanize-docs
---

# Align Spernakit Documentation

Review these surfaces against the live template and against one another:

| Surface             | Resolved location                                              | Purpose                                                                               | Audience                    |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| **README.md**       | `<spernakit-root>/README.md`                                   | Consolidated Spernakit entry point and ecosystem guide                                | Developers and operators    |
| **STACK.md**        | `<spernakit-root>/docs/template/STACK.md`                      | Canonical technical reference: architecture, patterns, commands                       | AI agents and developers    |
| **DEVELOPMENT.md**  | `<spernakit-root>/docs/template/DEVELOPMENT.md`                | Canonical development practices, coding style, and conventions                        | AI agents and developers    |
| **SPERNAKIT.md**    | `<aidd-root>/audits/SPERNAKIT.md`                              | Checklist-based audit framework for evaluating template drift and feature utilization | AI agents running audits    |
| **Fleet manifests** | `<spernakit-root>/spernakit.psd1` and `spernakit.psd1.example` | Local fleet roster and tracked seed format                                            | Fleet scripts and operators |
| **AGENTS.md**       | `<applications-root>/AGENTS.md`                                | Workspace directives, canonical toolchain, and architectural rules                    | AI coding agents            |

## Review Rules

1. Read every governing `AGENTS.md` before editing a file. Resolve all three roots from the path
   context supplied by aidd. If a required root is unresolved or a required file is missing, report
   that surface as unavailable instead of guessing a path.
2. Verify versions, commands, configuration, routes, authentication behavior, quality gates, and
   other implementation claims against the current package manifests, config files, source code,
   and scripts. Documentation agreeing with documentation is not enough.
3. Treat `STACK.md` and `DEVELOPMENT.md` as the intended architecture. When implementation conflicts
   with a governing rule, report the conflict instead of rewriting the rule to legitimize the
   implementation. Keep README summaries and SPERNAKIT audit checks aligned with confirmed rules
   and behavior.
4. Treat the local `spernakit.psd1` as the source of fleet membership, but not of its scalar values.
   Each registered app's `package.json` owns `version` and `spernakit_version`; runtime config owns
   the name, description, and ports. Use `bun run check:fleet-manifest`, then
   `bun run fleet-manifest:sync` when those mirrored values are stale. Do not repair them by hand.
   The tracked `.example` defines the seed format, not the live roster.
5. Apply confirmed documentation corrections in the surface that owns the claim. Keep unrelated
   sections untouched and report any conflict that cannot be resolved from authoritative local
   evidence.

## Validation

Run focused checks for the surfaces changed. From `<spernakit-root>`, include
`bun run check:docs`, `bun run check:version-refs`, and `bun run check:fleet-manifest` when their
inputs changed. Format-check changed Markdown in each owning repository. Report pre-existing or
out-of-scope failures without widening the edit.

Any prose you rewrite or add during alignment follows the humanize-docs skill's style contract (apply the humanize-docs skill to drafted text before saving): plain natural language, no em-dashes, no AI filler (delve, leverage, robust, seamless). Commands, paths, version numbers, and table data stay exact; sections you did not change stay untouched.

## Output

List confirmed discrepancies, the evidence used, files changed, focused checks run, and unresolved
conflicts. State explicitly when the review is a no-op.
