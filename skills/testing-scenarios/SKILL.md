---
name: testing-scenarios
description: 'Generate or augment `.aidd/testing-scenarios.md` for any aidd-managed project from its blueprint, executable surfaces, and features. Use to seed, expand, refresh, or brainstorm browser, CLI, API, service, library, and integration test scenarios.'
metadata:
    aidd-category: recipe-maturity
---

# Generate Testing Scenarios

Review a target project's blueprint and codebase, then write curated scenarios into
`{APP_DIR}/.aidd/testing-scenarios.md`. Testing scenarios apply to every project. Derive them from
the project's real user and integration surfaces instead of assuming a browser, framework, or
test client.

This skill only creates and edits the scenario catalog. Do not execute the scenarios.

## Usage

```
testing-scenarios [app] [--mode <seed|augment|refresh>] [--count <n>]
                    [--focus <area>]
```

- `[app]` → application name or path. If omitted, use the current repository when it uniquely
  resolves the target; otherwise return a usage error.
- `--mode` → catalog operation. Default is `augment`, or `seed` when the catalog is missing.
- `--count` → number of scenarios to add. Defaults are defined in Setup.
- `--focus` → limit new scenarios to the named feature area or executable surface.

## Setup

| Parameter | Default                                                | Example override                        |
| --------- | ------------------------------------------------------ | --------------------------------------- |
| **App**   | current repository when uniquely resolvable            | `<app-name>`                            |
| **Mode**  | `augment`                                              | `seed`, `augment`, `refresh`            |
| **Count** | `5` (augment) / `10` (seed) / match existing (refresh) | `15`                                    |
| **Focus** | whole app                                              | `--focus "workflow builder, analytics"` |

### Modes

- **`seed`**: Select automatically when `.aidd/testing-scenarios.md` is missing, or use explicitly
  when the user is starting over. Create the file from scratch with the full template header,
  description paragraph, numbered scenarios, and Post-Test Procedure footer.
- **`augment`** _(default)_: The file exists. Read it, identify coverage gaps, generate new scenarios that do not duplicate existing ones, and append them to the numbered list preserving numbering continuity. Do not touch existing scenarios or the footer.
- **`refresh`**: Rewrite the entire scenario list from scratch. Selecting this mode authorizes the
  rewrite. Preserve the header, description, app-specific notes, and Post-Test Procedure footer
  verbatim.

## Workflow

```
1. Resolve         APP_DIR from the app name
2. Read blueprint  .aidd/spec.md, project.md, project-structure.md,
                   roadmap.json (if present), scan features/
3. Read existing   .aidd/testing-scenarios.md if present
4. Survey surfaces Light read of the project's user-facing and integration entry points
5. Plan coverage   Map existing scenarios to feature areas; identify gaps
6. Generate        Write N new scenarios matching the house style
7. Merge           Append to existing file OR create new file from template
8. Report          List what was added and the coverage rationale
```

### Step 1: Resolve APP_DIR

Resolve the project under `<applications-root>/{app-name}/` or from an explicit path. If the
argument and current repository do not resolve one project, return a usage error listing current
candidates.

Confirm `{APP_DIR}/.aidd/` exists. If it does not, abort with an error; this skill will not create new `.aidd/` directories (that's a reconstruction job, not a testing job).

### Step 2: Read the blueprint

Read these files when present:

- `{APP_DIR}/.aidd/spec.md`: canonical feature list
- `{APP_DIR}/.aidd/project.md`: project overview and goals
- `{APP_DIR}/.aidd/project-structure.md`: code layout
- `{APP_DIR}/.aidd/roadmap.json`: if present, planned milestones

List `{APP_DIR}/.aidd/features/*/feature.json`, then skim the 15-25 most load-bearing files.
Prioritize completed, high-priority, and user-facing features based on each file's `status`,
`passes`, and `priority` fields.

### Step 3: Read existing catalog

```
Read {APP_DIR}/.aidd/testing-scenarios.md (if present)
```

Parse the numbered scenario list. For each existing scenario, classify it by feature area (e.g., "dashboard", "RBAC-OPERATOR", "export", "notifications"). This coverage map drives gap detection in step 5.

### Step 4: Survey executable surfaces

Read-only exploration: do not start or run the project. Determine its actual interfaces from source,
scripts, configuration, and documentation:

- **Browser or desktop UI:** routes, pages, navigation, state, forms, rendered artifacts, and roles
- **CLI:** commands, flags, configuration, stdin/stdout, exit codes, filesystem effects, and safety gates
- **API or service:** routes, clients, authentication, lifecycle, persistence, events, and integrations
- **Library or automation:** public entry points, consumers, fixtures, serialization, and failure contracts

Projects may expose more than one surface. Cover the real combination rather than forcing the
project into one category. Identify distinctive workflows, state transitions, imports/exports,
authorization boundaries, recovery behavior, and externally observable side effects.

### Step 5: Plan coverage

Build a target coverage matrix. Required coverage is:

1. **One scenario per major user or integration capability**
2. **At least one cross-cutting flow** spanning multiple commands, pages, entities, phases, or systems
3. **Role and authorization coverage** for every role the project actually implements
4. **Contract boundaries** such as invalid input, refusal paths, exit status, rollback, retry, or recovery
5. **Persistent and external effects** verified through their public interface
6. **Every rendered or served artifact loaded through its real serve path**: a feature that ships a
   template-rendered view, SSR/JSX page, string-built export/report, or serialized download needs at
   least one scenario that actually opens that page or triggers that output in the running app.
   Unit-level coverage of the helpers behind it does not substitute. A mangled template can 500 a
   page while helper tests stay green, and scenarios are often the only check that drives the real
   render/serve boundary. Pure-logic features with no rendered or served artifact need no such
   scenario.
7. **Distinctive edge cases only**; avoid generic cases unsupported by the project's actual behavior

Diff the target matrix against existing coverage. The gap list is what you generate.

If the user provided a **focus**, filter the gap list to the focus area and generate there, even if overall coverage is already high.

### Step 6: Generate scenarios

Preserve the established style when a catalog exists. For a new catalog:

- Use ``N. `spernakit-tester {app}: I want to ...` `` for a Spernakit or derived app.
- Use a plain numbered scenario for every other project. Name the real command, route, API,
  client, or workflow and the observable outcome; do not invent a skill or client prefix.

**Generation rules:**

- **One coherent scenario per numbered item.** It may wrap across Markdown lines.
- **Prefer cross-cutting flows** over isolated operations.
- **Prefer distinctive project mechanics** over generic behavior shared by its stack.
- **Name concrete features** that exist in the app. Reference real page names, real buttons, real flows discovered in step 4. Generic scenarios like "test the user settings" are not useful.
- **Role scenarios** must name a concrete action the role _can_ do and at least one it _cannot_ do.
- **Do not duplicate existing coverage.** If the existing file already has a dashboard drag-and-drop scenario, do not generate another.
- **Name public interfaces when they define behavior.** Commands, flags, routes, response shapes,
  exit codes, and visible side effects are valid scenario detail. Omit internal automation mechanics.

### Step 7: Merge into the catalog

**Seed mode** (file does not exist):

Create the file from this template, filling in `{AppName}`, `{description}`, any app-specific notes block (prerequisites, external dependencies), and the generated scenarios:

```markdown
# Testing Scenarios: {AppName}

{description paragraph: one to three sentences from project.md or spec.md}

{optional app-specific notes block}

## Scenarios

1. {scenario in the target project's established style}
2. {scenario in the target project's established style}
   ...

---

## Post-Test Procedure

- Record results and preserve reproducible evidence through the project's established test workflow
- Convert confirmed defects into reviewed remediation features or authenticated reports
- Run the aidd-local `feature-review` skill for newly created remediation features
- Implement and validate actionable remediation without changing completed feature history
- Run the project's quality gate after source changes
```

**Augment mode** (file exists):

Edit the existing numbered list surgically to insert new scenarios. Preserve:

- Header, description, and any app-specific notes: untouched
- Existing numbered scenarios: untouched and renumbered only if inserting in the middle (prefer appending)
- `---` separator and Post-Test Procedure footer: untouched

Append the new scenarios at the end of the `## Scenarios` list, continuing the numbering (e.g., if the file has 14 existing scenarios, new ones start at 15).

**Refresh mode** (destructive rewrite):

Print the planned new scenario list, then overwrite the scenarios block while preserving the header,
description, notes, and footer.

### Step 8: Report

Print a concise summary:

```
Generated N new scenarios for {app}:
  15. {first line of new scenario 15}
  16. {first line of new scenario 16}
  ...

Coverage rationale:
- Filled gap: {feature area}
- Filled gap: {feature area}
...

Next: execute scenario {N} through the project's established test client or lifecycle. Use the
aidd-local `spernakit-tester` skill only when the target is Spernakit or derived.
```

## Guardrails

- **Only author into `.aidd/testing-scenarios.md`** in the target app — it is the sole deliverable. Do not edit any other source or metadata file, and never edit another app's scenarios. The one exception is `.aidd/CHANGELOG.md`: every aidd run is required to record what it did there (the orchestrator treats it as run-owned bookkeeping, not a skill edit), so a CHANGELOG entry is expected, not a boundary violation.
- **Never delete existing scenarios** except when the invocation selects refresh mode.
- **Never invoke another skill from within this skill.** Scenario generation is a pure authoring task.
- **Do not create `.aidd/` directories.** If the target app has no `.aidd/`, abort with an error.
- **Never treat project type as a reason to skip the catalog.** Missing catalogs are seeded for
  browser, CLI, API, service, library, automation, and mixed-surface projects.
- **Never invent an execution prefix.** Preserve an existing prefix; use `spernakit-tester` only
  for Spernakit or derived apps; otherwise seed plain numbered scenarios.

## Examples

**Augment with default count:**

```
testing-scenarios <app>
```

Reads the app's blueprint and existing 15 scenarios, identifies about five gaps, and appends
scenarios 16-20.

**Seed a fresh catalog:**

```
testing-scenarios <app> --mode seed --count 15
```

Creates `.aidd/testing-scenarios.md` from scratch with 15 scenarios covering major features and all
applicable interfaces, roles, contract boundaries, and persistent effects.

**Focused generation:**

```
testing-scenarios <app> --focus "compliance, migration assessment"
```

Generates scenarios concentrated on the named focus areas, even if overall coverage is already high.

**Refresh:**

```
testing-scenarios spernakit --mode refresh
```

Rewrite Spernakit's scenario list from scratch. Print the plan, then write it directly.
