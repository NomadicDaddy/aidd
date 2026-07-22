---
name: update-spernakit-docs
description: "Documentation-alignment review across the core Spernakit docs (README, STACK, DEVELOPMENT, SPERNAKIT audit, spernakit.psd1, AGENTS). Use to confirm or restore consistency across Spernakit's canonical documentation set."
metadata:
    aidd-category: spernakit-fleet
---

# Align Spernakit Documentation

Perform a thorough documentation review and confirm alignment across them all:

| Document           | Location (relative to `<applications-root>/`) | Purpose                                                                               | Audience                                   |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| **README.md**      | `spernakit/README.md`                         | Consolidated Spernakit entry point and ecosystem guide                                | Universal reference                        |
| **STACK.md**       | `spernakit/docs/template/STACK.md`            | Canonical technical reference: architecture, patterns, commands                       | AI agents and developers (source of truth) |
| **DEVELOPMENT.md** | `spernakit/docs/template/DEVELOPMENT.md`      | Development best practices, coding style, conventions                                 | AI agents and developers (source of truth) |
| **SPERNAKIT.md**   | `aidd/audits/SPERNAKIT.md`                    | Checklist-based audit framework for evaluating template drift and feature utilization | AI agents performing audits                |
| **spernakit.psd1** | `spernakit/spernakit.psd1`                    | App registry: ports, versions, `spernakit_version` tracking for all derived apps      | PowerShell tooling and version management  |
| **AGENTS.md**      | `AGENTS.md` (root + per-app)                  | Project-level agent directives and stack-specific rules                               | Supported AI coding backends               |

Any prose you rewrite or add during alignment follows the humanize-docs skill's style contract (apply the humanize-docs skill to drafted text before saving): plain natural language, no em-dashes, no AI filler (delve, leverage, robust, seamless). Commands, paths, version numbers, and table data stay exact; sections you did not change stay untouched.
