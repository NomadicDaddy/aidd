---
name: ui-redesign-planner
description: "Review an application's frontend UX, write a redesign plan, and create validated remediation feature.json entries. Use when planning a repo-grounded usability, navigation, accessibility, responsive, or visual-hierarchy overhaul."
metadata:
    aidd-category: audit-remediation
---

# UI Redesign Planner

Review a target application's frontend experience and turn the redesign recommendations into
actionable aidd feature metadata. This skill plans and records UI/UX improvements; it does not edit
product frontend code.

## Usage

```
ui-redesign-planner {app}
```

## Design review source

If a `frontend-design` skill is available to you, invoke it for the Phase 2 design review and use
its findings as input to Phase 3. It is a richer aesthetic rubric than the fallback below.

If it is not available — including on any backend without a skill mechanism — run the Phase 2
fallback review yourself. The fallback is a complete procedure, not a degraded one; do not report
reduced confidence merely because `frontend-design` was absent.

Either way, Phases 1 and 3-5 are aidd-owned and always run as written here. Never delegate feature
metadata generation, roadmap assignment, or validation.

## Instructions

### Phase 1: Resolve Target and Read Context

1. Resolve `{app}` to the target project root. Prefer an explicit path when one is supplied;
   otherwise use the application name under `<applications-root>/`.
2. Confirm the project has a frontend surface. Read the relevant app context before judging:
    - `.aidd/spec.md`, `.aidd/assertions.md`, `.aidd/project-profile.json`, and `.aidd/roadmap.json`
      when present.
    - Existing `.aidd/features/*/feature.json`, prioritizing UI, navigation, layout, workflow,
      accessibility, and design-system features.
    - Frontend routes, pages, navigation, layout components, shared components, and screenshots or
      reports under `.aidd/reports/` when present.
3. Preserve stack conventions. For Spernakit applications, use React 19, Vite, shadcn/ui, Zustand,
   TanStack Query, native fetch, and the existing route/navigation structure. Do not propose new UI
   libraries unless the current app already uses them.

### Phase 2: UX and Design Review

Evaluate the app as a product, not as a collection of components.

1. Identify the target user, repeated workflows, information density needs, and operational tone.
2. Review navigation clarity, page hierarchy, scanability, interaction states, empty/loading/error
   states, responsive layout, accessibility, visual hierarchy, and consistency with the app's domain.
3. Recommendations must be specific, cohesive, and tailored to this application. Reject generic
   "modernize the UI" advice — if a recommendation would read identically against a different app,
   it is not specific enough to keep.

#### Fallback design review

Run this when `frontend-design` is unavailable. Judge visual design against these criteria and use
them when writing recommended design directions:

- **Coherence**: Does the interface commit to a discernible point of view and execute it
  consistently across screens? Flag surfaces that read as assembled defaults rather than decisions.
  Both dense operational tooling and spare, restrained layouts can be right — the failure mode is
  absence of intent, not intensity.
- **Typography**: Is the type system doing hierarchy work — distinguishable scale steps, deliberate
  weight and measure — or is everything one size in one face? Judge against the app's tone, not a
  fixed list of approved fonts.
- **Color and theme**: Is the palette driven by CSS variables or design tokens, so themes and states
  stay consistent? Look for meaningful contrast between dominant and accent roles, and verify color
  is never the sole carrier of state.
- **Spatial composition**: Is spacing systematic, and does grouping reflect actual relationships
  between elements? Flag layouts where whitespace is uniform everywhere and therefore communicates
  nothing.
- **Motion and feedback**: Does every state change the user causes produce visible acknowledgement?
  Prioritize missing feedback over decorative animation. Respect `prefers-reduced-motion`.
- **Accessibility as design**: Keyboard reachability, focus visibility, target sizing, contrast
  ratios, and label association are design criteria here, not a separate audit.
- **Context fit**: Does the visual language match what the app is for? An internal ops dashboard and
  a public marketing surface warrant different densities, tones, and levels of polish. Flag
  mismatches in either direction.

Match recommended complexity to the app's tone and the team's capacity to maintain it. Prefer
changes expressible through the app's existing framework and component library.

4. Keep recommendations implementation-ready. Each improvement must name the affected screens or
   components, the user problem, the proposed UX change, and concrete acceptance criteria. All
   directions must stay compatible with Phase 1 stack conventions; express design intent through
   existing dependencies, not new ones.

### Phase 3: Write the Redesign Plan

Write a **new** report; never overwrite an existing one:

```
{app}/.aidd/reports/ui-redesign-{RUN}.md
```

`{RUN}` is the run id of the sweep or review that produced the findings, including its mode when it
had one (`20260806-1257-mobile`). When invoked without one, use `YYYYMMDD-HHMM`. Two planning passes
against the same app — different viewport modes, different review questions, different dates — are
different documents with different conclusions. A bare `ui-redesign.md` makes the second one destroy
the first, and `.aidd/` is gitignored in many projects, so the loss is unrecoverable. If the target
path already exists, stop and report it rather than overwriting.

The report must include:

- Executive summary.
- Current UX strengths worth preserving.
- Prioritized improvement list.
- For each improvement: affected routes/components, user impact, recommended design direction,
  accessibility concerns, implementation notes, and expected validation.
- A final table mapping each recommendation to the generated feature ID.
- A note recording whether the Phase 2 review used `frontend-design` or the fallback.
- The viewport mode, viewports and commit the findings were observed at, so a later reader knows
  what this plan does and does not cover.

Write nothing outside `.aidd/`.

### Phase 4: Generate Remediation Feature JSON

For each concrete improvement, create one feature directory:

```
{app}/.aidd/features/remediation-{YYYYMMDD}-{short-slug}/feature.json
```

Each `feature.json` must:

1. Use the same `id` as the directory name.
2. Set `status` to `backlog` and `passes` to `false`.
3. Include a specific `title`, `description`, `category`, `priority`, `dependencies`, `spec`,
   `affectedFiles`, `summary`, and `notes`.
4. Use `priority` based on user impact:
    - `P1` for navigation, task completion, severe accessibility, or workflow-blocking UX issues.
    - `P2` for meaningful usability, hierarchy, responsive, or interaction-state improvements.
    - `P3` for polish, consistency, or lower-impact visual refinements.
5. Include relations through `dependencies`:
    - Read existing feature IDs and depend on the closest layout, navigation, design-system, API, or
      workflow feature when applicable.
    - Do not invent dependency IDs. Use an empty array if no valid dependency exists.
6. Include acceptance criteria in `spec` that a future coding agent can implement and validate. When
   the criterion is visual — layout, spacing, sizing, overflow, responsive behaviour — it must name
   the viewport to check it at and require a screenshot. A visual criterion that can be satisfied by
   reading source will be, and the claim will be wrong as often as it is right.
7. Mention the redesign report path in `notes` for traceability.

Do not create duplicate features. If an existing backlog feature already covers an improvement,
update that feature instead of creating a new remediation, and record the mapping in the report.

### Phase 5: Assign Current Milestone and Validate

1. Read `{app}/.aidd/roadmap.json` if present. Assign every new or updated feature to the current
   milestone. Use the existing current milestone when the roadmap marks one; otherwise use the
   milestone with the highest numeric priority. Do not create a new milestone unless no milestone
   exists.
2. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace.

3. Do not shell into the aidd installation to validate. aidd re-validates every feature record when the run ends and reports any contract issues with the run. That covers the project this run targets; for another project, report the metadata as unvalidated instead of reaching outside the workspace.

4. Fix any invalid feature JSON, unresolved dependencies, roadmap drift, duplicate IDs, or orphaned
   feature directories before reporting completion — read the records back yourself rather than
   waiting for aidd's end-of-run check to find them.

## Output

Finish with:

- Redesign report path.
- Which Phase 2 review path ran (`frontend-design` or fallback).
- Count and IDs of created feature JSONs.
- Count and IDs of updated existing feature JSONs.
- Roadmap assignment result.
- Feature validation result.
