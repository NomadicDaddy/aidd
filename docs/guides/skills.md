# Skills

Skills are one-shot directive packages that follow the
[Agent Skills specification](https://agentskills.io/specification). Recipes remain the composition
layer: a skill can run directly or appear as one step in a multi-step recipe.

## Catalog locations

aidd merges two catalogs with no precedence:

- `skills/<id>/SKILL.md` contains bundled skills shipped with aidd.
- `<web.dataDir>/skills/<id>/SKILL.md` contains managed imported skills.

Duplicate IDs fail catalog loading. Every API definition reports `origin: "bundled"` or
`origin: "imported"`, but origin does not change execution, recipe, maturity, diary, or telemetry
behavior. Managed imports are persistent user state; include the entire `data/` directory in normal
backups and upgrades.

## Definition format

`SKILL.md` starts with YAML frontmatter parsed by `Bun.YAML.parse`, followed by Markdown:

```markdown
---
name: feature-coverage-audit
description: Verify implemented features have matching documentation and feature metadata.
license: FSL-1.1-ALv2
compatibility: Requires a local Git checkout and Bun.
allowed-tools: Read Bash
metadata:
    aidd-category: audit-remediation
    provider-key: provider-value
---

# Feature Coverage Audit

Audit one project at a time. Use `$ARGUMENTS` as the target and options.
```

The directory ID and `name` must match. IDs are lowercase letters, digits, and single hyphens,
cannot start or end with a hyphen, cannot contain consecutive hyphens, and are at most 64
characters. `description` is required and limited to 1,024 characters. The display title comes
from the first H1. `license`, `compatibility`, `metadata`, and `allowed-tools` are retained, as are
unknown provider extension fields. Compatibility and tool declarations are advisory because
enforcement depends on the selected backend.

Bundled skills declare one category in `metadata.aidd-category`:

`general` · `runtime` · `metadata` · `audit-remediation` · `recipe-maturity` ·
`spernakit-fleet`

Every file beside the root `SKILL.md` is exposed as a support path. A `## Usage` code block is
shown when present. Skills accept one free-form argument string; there is no aidd-specific
structured argument schema.

## Running a skill

From the CLI:

```powershell
bun run start -- --project-dir C:\path\to\my-app --skill hygiene --skill-args "fix"
```

`--skill-args` is optional and is substituted wherever the definition references `$ARGUMENTS`.
The CLI discovers bundled and managed imported skills through the same merged catalog.

Every invocation tells the agent to adapt the skill's intent to the target project's actual code,
architecture, stack, tooling, paths, and conventions. Spernakit-specific details are examples when
the skill otherwise applies; explicitly Spernakit-only skills retain that applicability boundary
instead of being reinterpreted as unrelated workflows.

From the web panel, open `/skills`, select a project and optional launch target, then run the
skill. A one-shot launch uses the synthetic recipe ID `skill:<id>` and returns a pipeline session,
so it follows the normal managed execution, resume, and telemetry paths.

Recipes reference skills with `stepType: "skill"` and `configJson.skillId`:

```json
{
	"configJson": {
		"args": "{application}",
		"executionIntent": "review-only",
		"skillId": "feature-review"
	},
	"name": "Review features",
	"stepType": "skill"
}
```

## Execution intent

Every skill run declares `executionIntent`, either `review-only` or `apply-changes`. A recipe step
must declare it explicitly — a `skill` step without it is rejected at normalization. One-shot
launches default to `review-only`.

`review-only` wraps the compiled skill in aidd's read-only directive contract: the run may not edit
files, write metadata, touch a changelog, or create commits, and a skill step that asks for changes
is redirected into describing the diff it would have produced. `apply-changes` uses the mutation
contract instead, which permits writes.

Skill definitions are written write-intentional: a workflow that finds a problem also states the
fix and applies it. The prohibition lives in `review-only` and nowhere else. Do not restate it in a
skill body — a definition that declares its own read-only boundary applies under both intents,
because that sentence is the only instruction in the prompt on the subject and `apply-changes`
merely omits a prohibition rather than adding an instruction. Such a skill silently does nothing
when an operator asks it to apply changes.

Skills whose deliverable is itself a written artifact (`codebase-analysis` writes an audit report;
`testing-scenarios` writes `.aidd/testing-scenarios.md`) scope their writes to that artifact. That
is a deliverable boundary, not an intent boundary, and it belongs in the definition.

## Importing local skills

The Skills page and authenticated API manage local-folder imports:

- `POST /api/v1/skills/imports/preview`
- `POST /api/v1/skills/imports`
- `DELETE /api/v1/skills/imports/:id`

The source folder must be under a configured `web.allowedRoots` entry. Preview validates the
complete package and reports its ID, category, size, file count, hash, and collision state. Import
copies the package unchanged into `data/skills`, then records its category, canonical source path,
timestamp, and SHA-256 hash in `data/skills/catalog.json`.

Replacement must be explicit and applies only to an existing imported skill. Bundled IDs cannot
be replaced. Imports reject symbolic links and junctions, storage recursion, more than 2,000 files,
individual files over 25 MiB, and packages over 100 MiB. A complete copy is staged and validated
before the destination is swapped. Deletion is blocked while a recipe or maturity action still
references the skill.

Import is intentionally local-folder only. ZIP, Git, marketplace, live-link, synchronization, and
product-level promotion are outside this interface. To ship an imported skill as bundled product
content, review it and make a normal source change under `skills/`.
