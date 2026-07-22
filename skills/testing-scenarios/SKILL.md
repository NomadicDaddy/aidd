---
name: testing-scenarios
description: "Generate or augment `.aidd/testing-scenarios.md` from a Spernakit app's blueprint, routes, and features. Use to seed, expand, or brainstorm tester scenarios and test cases."
metadata:
    aidd-category: recipe-maturity
---

# Generate Testing Scenarios

Review a target Spernakit application's reconstruction blueprint and codebase, then write curated
`spernakit-tester` scenarios into `{APP_DIR}/.aidd/testing-scenarios.md`. This skill is the authoring
counterpart to the aidd-local `spernakit-tester` skill, which executes scenarios; this skill only
creates and edits the scenario catalog.

Do not execute tests through this skill. Use the aidd-local `spernakit-tester` skill for execution.

## Setup

| Parameter | Default                                                | Example override                     |
| --------- | ------------------------------------------------------ | ------------------------------------ |
| **App**   | _(required)_                                           | `<app-name>`                         |
| **Mode**  | `augment`                                              | `seed`, `augment`, `refresh`         |
| **Count** | `5` (augment) / `10` (seed) / match existing (refresh) | `15`                                 |
| **Focus** | whole app                                              | `focus: workflow builder, analytics` |

### Modes

- **`seed`**: The app has no `.aidd/testing-scenarios.md` yet (or the user is starting over). Create the file from scratch with the full template header, description paragraph, numbered scenarios, and Post-Test Procedure footer.
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
4. Survey code     Light read of frontend routes, navigation, stores, RBAC
                   tiers, and distinctive UI elements
5. Plan coverage   Map existing scenarios to feature areas; identify gaps
6. Generate        Write N new scenarios matching the house style
7. Merge           Append to existing file OR create new file from template
8. Report          List what was added and the coverage rationale
```

### Step 1: Resolve APP_DIR

Resolve current Spernakit apps under `<applications-root>/{app-name}/`. If the argument and current
repository do not resolve one app, return a usage error listing current candidates.

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

### Step 4: Survey the frontend

Read-only exploration: no running code. Look at:

- `{APP_DIR}/frontend/src/routes.tsx`: full route inventory
- `{APP_DIR}/frontend/src/pages/` directory structure: feature areas
- `{APP_DIR}/frontend/src/stores/`: stateful client features worth exercising
- `{APP_DIR}/backend/src/routes/`: backend domains and auth guards

Identify distinctive UI elements: multi-step flows, drag-and-drop, real-time WebSocket surfaces, file uploads, complex filters, visualization pages, export/import features, and any app-specific mechanics.

Check `backend/src/plugins/auth/` or equivalent for RBAC tiers. Standard Spernakit apps have
SYSOP/ADMIN/MANAGER/OPERATOR/VIEWER. Spernakit-lite apps have no RBAC; detect this from the absence
of an auth plugin rather than from the app's name.

### Step 5: Plan coverage

Build a target coverage matrix. For a standard app, required coverage is:

1. **One scenario per major feature area** (entity CRUD flows, distinctive mechanics, integrations)
2. **At least one cross-cutting flow** that touches multiple pages/entities
3. **Full RBAC coverage** (5 scenarios: SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER), only for apps with RBAC
4. **Edge cases only when distinctive** (e.g., websocket disconnect, auth expiry, failed imports); avoid generic edge cases
5. **Every rendered or served artifact loaded through its real serve path**: a feature that ships a
   template-rendered view, SSR/JSX page, string-built export/report, or serialized download needs at
   least one scenario that actually opens that page or triggers that output in the running app.
   Unit-level coverage of the helpers behind it does not substitute. A mangled template can 500 a
   page while helper tests stay green, and scenarios are often the only check that drives the real
   render/serve boundary. Pure-logic features with no rendered or served artifact need no such
   scenario.

Diff the target matrix against existing coverage. The gap list is what you generate.

If the user provided a **focus**, filter the gap list to the focus area and generate there, even if overall coverage is already high.

### Step 6: Generate scenarios

Each generated scenario is a single numbered markdown list item in this exact format:

```markdown
N. `spernakit-tester {app}: I want to {one-sentence end-user intent describing a cross-cutting flow}`
```

**Generation rules:**

- **One sentence per scenario.** Commas and semicolons are fine for chaining; no em-dashes. No multi-sentence scenarios.
- **Begin with "I want to"** (or "I want to verify", "I want to test"); matches the house style of every existing file.
- **Prefer cross-cutting flows** (multi-page, multi-entity, stateful) over isolated CRUD operations.
- **Prefer distinctive app mechanics** over generic features shared by all Spernakit apps. Write
  about the mechanics that make this app unlike its siblings - a bespoke multi-step interview, a
  fleet-wide query editor, a task dependency chain - rather than login forms.
- **Name concrete features** that exist in the app. Reference real page names, real buttons, real flows discovered in step 4. Generic scenarios like "test the user settings" are not useful.
- **RBAC scenarios** (when generating them): one per tier, must name a concrete action the tier _can_ do and at least one the tier _cannot_ do. Match the tone of existing SYSOP/ADMIN/MANAGER/OPERATOR/VIEWER scenarios in other apps.
- **Do not duplicate existing coverage.** If the existing file already has a dashboard drag-and-drop scenario, do not generate another.
- **No verification-method detail.** Write what the user wants to do, not how to automate it. The `spernakit-tester` skill decides the mechanics.

### Step 7: Merge into the catalog

**Seed mode** (file does not exist):

Create the file from this template, filling in `{AppName}`, `{description}`, any app-specific notes block (prerequisites, external dependencies), and the generated scenarios:

```markdown
# Testing Scenarios: {AppName}

{description paragraph: one to three sentences from project.md or spec.md}

{optional app-specific notes block}

## Scenarios

1. `spernakit-tester {app}: I want to ...`
2. `spernakit-tester {app}: I want to ...`
   ...

---

## Post-Test Procedure

- Run the aidd-local `bug2feature` skill for the report IDs created during the test session
- Leave database-backed reports intact; the current API has no status or deletion mutation
- Run the aidd-local `feature-review` skill for {scope}
- Implement actionable remediation features and apply reusable fixes to Spernakit when appropriate
- Validate completed remediation features and update their status and pass state; do not delete them
- Create a session report that includes the time spent on each step
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

Next: invoke the aidd-local `spernakit-tester` skill for {app}: run scenario {N} to execute any of the new entries.
```

## Guardrails

- **Only modify `.aidd/testing-scenarios.md`** in the target app. Never touch any other file. Never edit another app's scenarios.
- **Never delete existing scenarios** except when the invocation selects refresh mode.
- **Never invoke the aidd-local `spernakit-tester` skill** or any other skill from within this skill. Scenario generation is a pure authoring task.
- **Do not create `.aidd/` directories.** If the target app has no `.aidd/`, abort with an error.
- **Non-Spernakit apps** do not use the `spernakit-tester` prefix, because they are evaluated
  through their own client rather than browser automation. Never assume a prefix for these: read
  the app's existing `.aidd/testing-scenarios.md` and reuse whatever prefix it already uses. If the
  file does not exist yet, return a scope error; this skill only seeds Spernakit scenario catalogs.

## Examples

**Augment with default count:**

```
testing-scenarios <app-name>
```

Reads the app's blueprint and existing 15 scenarios, identifies about five gaps, and appends
scenarios 16-20.

**Seed a fresh catalog:**

```
testing-scenarios <app-name> seed 15
```

Creates `.aidd/testing-scenarios.md` from scratch with 15 scenarios covering major features and all
five RBAC tiers.

**Focused generation:**

```
testing-scenarios <app-name> focus: compliance, migration assessment
```

Generates scenarios concentrated on the named focus areas, even if overall coverage is already high.

**Refresh:**

```
testing-scenarios spernakit refresh
```

Rewrite Spernakit's scenario list from scratch. Print the plan, then write it directly.
