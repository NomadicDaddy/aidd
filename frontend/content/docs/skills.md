# Skills

Skills are reusable, one-shot directive packages. Recipes compose them into multi-step pipelines.

The page merges bundled skills with managed imports stored under persistent `data/skills` state.
Each card shows its origin, category, description, usage, support files, and advisory compatibility
or tool declarations.

## Run a skill

Select a skill, project, and optional backend or model. Supply one free-form argument string, then
launch. aidd tracks the one-shot as a synthetic `skill:{id}` pipeline session and records the same
telemetry as a recipe skill step.

## Import a local skill

Enter a local folder under a configured allowed root, choose an aidd category, and preview it.
Preview validates `SKILL.md`, package limits, links, and collisions before anything is copied.
Import stores an unchanged managed copy plus provenance and a SHA-256 hash under `data/skills`.

An existing imported ID requires Replace. A bundled ID cannot be replaced. Delete is available
only for imported skills and is blocked while recipes or maturity actions reference it.

Compatibility and allowed-tool declarations come from the Agent Skills definition and are
advisory; enforcement depends on the selected backend.
