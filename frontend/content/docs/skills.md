# Skills

Skills are reusable, one-shot directive packages. Each skill is a folder with a [SKILL.md](https://agentskills.io/specification) definition and optional support files. [Recipes](/docs/recipes) compose them into multi-step pipelines. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

The page merges [bundled skills](/skills) from the installation's `skills/` catalog with managed <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> imports in the configured data directory (`data/skills` by default). Search by id, title, or description, or filter by category. Catalog rows identify imported skills, recipe and maturity use, and recorded invocation totals. Select a skill to read its description and full definition, inspect support files and advisory declarations, schedule it, or review its import provenance.

## Run a skill

Select a skill and project, then optionally supply one free-form argument string or override the backend, model, and reasoning effort. aidd tracks the one-shot as a synthetic `skill:{id}` pipeline session and a top-level skill invocation. Skill steps inside stored recipes instead retain their parent recipe in telemetry.

Execution intent sets the agent's permission to change project files:

Review only
: instructs the agent not to edit project files, update metadata or changelogs, or make commits. A skill that would apply a fix describes the proposed changes instead. aidd still writes its own run records; this instruction is not a filesystem sandbox.
Apply changes
: removes the outer read-only prohibition so the skill may carry authorized changes through and commit them when needed. It does not expand the skill's requested scope or override project rules.

## Import a local skill

Enter a local folder under an Application Root configured in Settings, choose an aidd category, and preview it. Preview validates the root `SKILL.md`, package size and file-count limits, rejects symbolic links, junctions, and storage overlap, and detects id collisions before anything is copied.

Agent Skills descriptions are required and must contain 1 to 1,024 characters; any provider-specific truncation used to display skill listings is separate and does not relax this catalog limit.

Import atomically stores an unchanged managed copy in the configured data directory and records its category, canonical source path, import time, and a SHA-256 hash covering every copied file.

Replace
: is required when an imported ID already exists; a successful preview changes the commit action from **Import** to **Replace**.
Bundled IDs
: cannot be replaced or deleted.
Delete
: is available only for imported skills and is blocked while recipes, maturity actions, or non-archived scheduled tasks reference the skill.

Compatibility and allowed-tool declarations come from the Agent Skills definition and are advisory; enforcement depends on the selected backend.
