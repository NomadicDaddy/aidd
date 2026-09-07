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
ui-redesign-planner <app> [--source <report-path>[,<report-path>...]]
```

- `<app>` identifies the application to plan.
- `--source` identifies the exact sweep or review reports to consume. When supplied, resolve each
  inside the application, read it first, and preserve its run id, mode, viewports, findings, and
  evidence paths through the plan and generated features. Without it, perform Phase 2 directly.
- A source may be a literal report path, or the selector `design-sweep:{mode}`, which resolves to
  the newest row for that mode in `{app}/.aidd/reports/design-sweep/index.md` — the append-only
  index `frontend-design-sweep` writes, whose second column is the mode and whose last column is
  the report path. Use it when the caller cannot know a run-stamped filename in advance.
- **Comma-separated sources are one planning pass, not several.** Reading every report before
  filing anything is the point: a finding that appears in two of them is one improvement seen at
  two viewports, and only a planner holding both can tell that from two separate improvements.
  Never invoke this skill once per report against the same application in the same session — the
  second pass cannot see what the first filed as anything but pre-existing backlog, and Phase 4
  will fold its findings into records it did not write.

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
had one (`20260806-1257-mobile`). When invoked without one, use `YYYYMMDD-HHMM`. When the sources
span more than one run, this pass is not any of their run ids: use this pass's own `YYYYMMDD-HHMM`
and list every source run id, with its mode and viewports, in the report header. Two planning passes
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

Each concrete improvement is a non-standalone remediation finding, not a new product capability.
Create one remediation directory for it:

```
{app}/.aidd/features/remediation-{YYYYMMDD}-{short-slug}/feature.json
```

Use the date at the start of the source run id; with several sources, use the earliest. Without
`--source`, use the current review date. Do not strip the `remediation-` prefix merely because the
target application owns the finding. Once completed, the remediation can be folded into its durable
owning feature by `consolidate-features`.

**The directory carries no mode, so the slug must.** Two sweeps of one app on one day at two
viewport classes reach the same components and derive the same slugs, and this path — unlike the
report path above — has no run id to separate them. A mode-specific finding takes a slug that says
so (`mobile-nav-drawer-overlap`, not `nav-drawer-overlap`); a finding that holds at every viewport
takes an unqualified slug and names all of them in its acceptance criteria. **If the target
directory already exists, stop and report it rather than writing** — the same rule the report path
carries, for the same reason: `.aidd/` is gitignored in many projects, so an overwritten record is
gone with no history to recover it from.

**File on a Spernakit-derived app the same as anywhere else.** An earlier version of this skill
held back on any app carrying `spernakit_version`, on the belief that its process-record guard
condemned the `remediation-` name itself. It does not, and has not since 2026-08-26:
`<spernakit-root>/scripts/lib/template-features/resident.ts` judges a resident record by provenance
— the template corpus carrying the same directory, or a `spernakit_version` stamp on the app's own
copy — and allows an unstamped record with no upstream counterpart whatever it is named. Its own
failure output says so: "A finding this application authored itself is not reported here, whatever
it is named." Its header names the cost of the older rule directly — this skill filing nothing on
derived apps rather than disguising a finding under a slug that lied about what it was. So write the
remediation, unstamped, with no `spernakit_version`. What still holds: never add that field to a
record this skill authors, since the stamp is what marks a record as having come from upstream.

Each `feature.json` must:

1. Use the same `id` as the directory name.
2. Set `status` to `backlog` and `passes` to `false`.
3. Include a specific `title`, `description`, `category`, `priority`, `dependencies`, `spec`,
   `affectedFiles`, `summary`, and `notes`.
4. Use numeric `priority` values based on user impact (mapping imported report labels when
   necessary):
    - `1` for `P1` navigation, task completion, severe accessibility, or workflow-blocking UX
      issues.
    - `2` for `P2` meaningful usability, hierarchy, responsive, or interaction-state improvements.
    - `3` for `P3` polish, consistency, or lower-impact visual refinements.
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

**Fold only into records that predate this run.** The rule above assumes the existing record was
written by someone who had the whole picture; a remediation filed minutes ago by a sibling sweep of
the same session was not. Updating one of those rewrites a spec, an acceptance criterion, a
viewport, and a screenshot path with evidence from a mode that record never measured, and the
remediation then verifies at the wrong viewport. Read the candidate's `createdAt` when present and
its source report before folding. When provenance is missing and you cannot establish that the
record predates this run, do not fold into it. When the evidence names a different mode of the
current run, the two findings are siblings, and they either merge into one record naming both
viewports — decided here, by the one pass that can see both — or stay separate. They never overwrite
each other.

### Phase 5: Assign Current Milestone and Validate

1. Read `{app}/.aidd/roadmap.json` if present. Preserve a valid existing assignment on an updated
   feature. Assign each new or unmapped remediation to the first incomplete milestone in ascending
   numeric-priority order, falling back to the last milestone when all are complete. Do not create a
   new milestone while any exists; when none exists, create `v1.0` at priority 1.
2. Do not shell into the aidd installation to propagate this. Write the assignment into
   `roadmap.json`; aidd's run-end metadata reconciliation propagates the milestone priority and
   resolved dependency IDs into mapped feature records, and reports applied updates, drift, or
   errors with the run. That covers the project this run targets; if you changed assignments in
   another project, report it as needing a separate pass instead of reaching outside the workspace.

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
