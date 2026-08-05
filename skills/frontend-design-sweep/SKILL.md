---
name: frontend-design-sweep
description: 'Sweep every page and tab of a running application with one design-review subagent per surface, then consolidate the results into a single prioritized report. Use for a whole-app pass on how the UI could look cleaner, sleeker, and more consistent across screens.'
metadata:
    aidd-category: audit-remediation
---

# Frontend Design Sweep

Review an entire running application one surface at a time — every page, and every tab within a
page — using an independent design-review subagent per surface, then merge what they found into one
consolidated report.

Fan out to observe; centralize to judge. Consistency is a property that only exists _between_
surfaces, so a reviewer looking at one page cannot see it, and a single reviewer looking at sixty
pages runs out of attention long before the last one. This skill splits those jobs.

## Usage

```
frontend-design-sweep [app] [url] [--scope <nav-group|route-prefix>] [--features]
```

- Zero args → infer the app from the current repository, and the URL from its dev configuration.
- `--scope` → limit the sweep to one navigation group or route prefix. Use it for large apps.
- `--features` → also file remediation features (Phase 6). Default is report only.

The review question is fixed here: how the UI could look cleaner, sleeker, and more consistent. To
ask a different question — accessibility, mobile UX, copy, empty states — use `page-by-page`, which
takes the question as an argument and reviews one page at a time rather than one tab at a time.

## Applicability

Applies to any project that serves a browsable interface, whatever the stack. The two genuine
preconditions are a **reachable running URL** and **more than one surface** to compare. A CLI, a
library, or a single-screen tool has nothing for this skill to do — say so and stop.

This skill never edits frontend code. Hand approved changes to `ui-playground-apply`,
`spernakit-apply-ui`, or ordinary implementation work.

## Phase 0: Resolve the target and fix the run conditions

| Input          | Default                                                   |
| -------------- | --------------------------------------------------------- |
| App directory  | Current repository, or the named application root         |
| Base URL       | Frontend URL from the project's own dev configuration     |
| Run id         | `{RUN}` = `YYYYMMDD-HHMM`                                 |
| Work directory | `{app}/.aidd/reports/design-sweep/{RUN}/`                 |
| Screenshots    | `{app}/screenshots/design-sweep/{RUN}/`                   |
| Viewports      | `1440x900` primary, `768x1024` narrow                     |
| Theme          | The app's default theme, applied to every surface         |
| Authentication | The highest role the user authorizes; anonymous otherwise |

Discover the start command from the project's own manifest. If the app is not already reachable,
start it, record that this run owns the process, and wait for the URL to respond. Leave a
pre-existing process alone.

**Fix theme, viewport, and role once and hold them for the whole run.** Surfaces captured under
different conditions cannot be compared, and comparison is the entire point.

## Phase 1: Enumerate every surface

A _surface_ is one distinct visual state a user navigates to. Build the list from these sources in
order, adding what each one contributes:

1. `{app}/.aidd/screen-map.md` when present — the fastest authoritative route list.
2. The router configuration, for routes the screen map missed or that post-date it.
3. The navigation configuration, for reachability order and role gating.
4. Tab components inside page source, for surfaces the router never sees.

Four kinds of surface, reached differently:

| Kind              | Addressing      | How the reviewer reaches it          |
| ----------------- | --------------- | ------------------------------------ |
| Static route      | URL             | Open the URL                         |
| Nested-route tab  | URL             | Open the URL                         |
| Query-param tab   | URL + `?tab=`   | Open the URL with each tab value     |
| In-page tab panel | Not addressable | Open the parent, then click each tab |

In-page tab panels are the ones sweeps normally miss. A page with five tabs is five surfaces, and
four of them have no URL. Record the click path for each so the reviewer reaches it deterministically
rather than guessing.

Two enumeration rules:

- **Parameterized routes need a real record.** Reach `/thing/:id` by navigating from its list page
  and taking the first row. Never invent an id and never report the resulting not-found page.
- **Dialogs and drawers count only when they are the primary work surface** for a task — a create
  wizard, an editor. Confirmation prompts and menus are not surfaces.

Group surfaces by the role required. A surface you cannot authenticate into is **unreached**, not a
finding. Never report an authorization block, or an empty state caused by absent data, as a design
defect.

Write the work list to `{work}/surfaces.json`:

```json
{
	"id": "explorer-databases",
	"label": "Explorer — Databases",
	"minRole": "VIEWER",
	"route": "/explorer/databases",
	"source": "screen-map",
	"tabs": [{ "id": "overview", "label": "Overview", "reach": "click:tab[Overview]" }],
	"url": "http://localhost:5173/explorer/databases"
}
```

Report the surface count and the excluded set **before** fanning out. Above roughly forty surfaces,
confirm the scope with the user or shard the run by navigation group.

## Phase 2: Fix the design baseline before fanning out

Do this once, in the parent, and paste the result into every subagent prompt. Without a shared
yardstick each reviewer invents its own direction, their consistency findings contradict each other,
and consolidation produces mush.

1. Read the design token layer (theme variables, type scale, spacing scale, radius, elevation) and
   the shared components that own repeated structure — page header, card, table, form field, empty
   state, dialog.
2. Pick two or three **exemplar surfaces** that execute the house pattern best. These become the
   reference for every "inconsistent with the rest of the app" judgment.
3. Write a baseline digest of 400 words or fewer to `{work}/baseline.md`: tokens in use, type scale
   steps, spacing rhythm, the shared components and what each one owns, the exemplars, and the
   app's existing aesthetic direction stated plainly.

The digest describes what the app **already is**. It is not the redesign; it is the ruler.

## Phase 3: Fan out — one subagent per surface

Run one subagent per surface, four to six at a time, dispatched in a single message per batch so
they run concurrently. If the runtime has no subagents, walk the same procedure sequentially and say
so in the report.

Give each subagent its own browser session (`ds-{RUN}-{n}`) and require it to close that session.
Concurrent reviewers sharing one session will navigate each other's tabs out from under themselves.

Prompt template:

```text
Review one surface of {app} as a design critic.

Surface: {label} — {url}
Tabs to cover: {tab list with click paths, or "none"}
Viewports: 1440x900, then 768x1024
Session: ds-{RUN}-{n}

Invoke: /frontend-design {url} — how could this look cleaner? sleeker? more consistent
across the UI?

Judge "consistent" against this baseline, not against your own taste:
{baseline digest}

Evidence, per tab, before judging anything:
  - screenshot at each viewport into {screenshots}/{surface-id}-{tab}-{viewport}.png
  - an interactive snapshot
  - console and error output

WRITE RULE: write only your screenshots and {work}/findings/{surface-id}.json. Do NOT
create or modify ui-redesign.md, any feature.json, the roadmap, or any product source.
Other reviewers are running concurrently and the consolidation is done by the caller.

Do not report: authorization blocks, empty states caused by absent data, loading
skeletons, or anything you did not see on screen. This machine reports
prefers-reduced-motion in every browser — confirm a motion finding against the code
before calling motion absent.

Return findings as JSON matching {schema}. Return an empty findings array rather than
padding with generic advice.
```

Finding schema — one object per observation:

| Field             | Value                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface`         | Surface id                                                                                                                                                       |
| `tab`             | Tab id, or null                                                                                                                                                  |
| `component`       | The component or region it lives in, named as the codebase names it                                                                                              |
| `category`        | `consistency` \| `hierarchy` \| `density` \| `typography` \| `color` \| `spacing` \| `state-feedback` \| `responsive` \| `accessibility` \| `motion` \| `polish` |
| `severity`        | `P1` blocks or badly degrades a task \| `P2` real usability or hierarchy cost \| `P3` polish                                                                     |
| `observation`     | What is on screen, stated so someone else can verify it in the screenshot                                                                                        |
| `proposal`        | The concrete change, expressed in the app's existing tokens and components                                                                                       |
| `scope`           | `local` to this surface, or `systemic` if the reviewer believes it repeats                                                                                       |
| `sharedComponent` | The shared component the fix belongs in, when the finding traces to one                                                                                          |
| `evidence`        | Screenshot path                                                                                                                                                  |

If a subagent fails or its surface will not load, record the surface as unreached with the reason.
Never fill the gap by guessing what that page probably looks like.

## Phase 4: Consolidate

Cluster by **component and category**, not by page. This is the step the fan-out exists to enable.

1. **Merge.** Identical proposals across surfaces collapse into one finding that lists every surface
   it was seen on. Keep the clearest screenshot as evidence.
2. **Promote.** A finding seen on three or more surfaces, or traced to a shared component, becomes
   systemic. Its fix belongs in the token or shared-component layer — never as N per-page edits.
3. **Resolve conflicts.** When two reviewers propose opposite directions for the same component, the
   Phase 2 exemplars decide. Record the rejected alternative and why it lost.
4. **Cut.** Drop findings with no evidence, duplicates of one root cause, and anything generic — if a
   recommendation would read identically against a different application, it is not a finding.
5. **Rank.** Consistency violations first, then hierarchy and scanability, then responsive and state
   feedback, then polish. Accessibility ranks by its own severity, not last by default.
6. **Sequence.** Order fixes so shared-layer changes land first, and mark the local findings each
   systemic fix is expected to absorb. Many local findings disappear the moment the shared component
   changes; implementing them first wastes the work twice.

## Phase 5: Report

Write `{app}/.aidd/reports/ui-design-sweep.md`:

- **Run header** — URL, theme, viewports, role, date, surfaces enumerated, reviewed, unreached.
- **Coverage table** — every surface with its tabs, marked `visited`, `partial`, or `unreached` with
  a reason. List the unreached ones explicitly; a sweep that hides its gaps is worse than a smaller
  sweep that names them.
- **Baseline digest** — carried from Phase 2, so later readers know what "consistent" meant here.
- **Systemic findings** — for each: the component, the surfaces affected, the observation, the
  proposed change in existing tokens and components, and acceptance criteria a implementer can check.
- **Local findings** — grouped by surface, with the absorbed-by-systemic ones marked.
- **Screenshot index** — surface to evidence path.

Do not describe the sweep as complete unless every row of the coverage table says `visited`.

## Phase 6: Remediation features (opt-in)

Only with `--features`, or when the user asks. Hand the consolidated findings to
`ui-redesign-planner` — or `frontend-design` when it is available — and let it own feature metadata,
milestone assignment, and validation. Do not restate those rules here and do not write feature JSON
directly from this skill.

One feature per systemic finding. Local findings bundle into a single per-area feature unless they
are `P1`.

## Cleanup

1. Confirm every subagent closed its browser session; close any that remain.
2. Stop the application only if this run started it.
3. Report every surface visited, every gate or command run, and anything left running.

## Principles

1. **Consistency is cross-surface.** It is why the sweep fans out, and why the parent, not the
   reviewer, decides what is inconsistent.
2. **Reviewers observe; the caller judges.** Independent observations stay uncontaminated by each
   other, and one place holds the whole picture.
3. **One writer.** Exactly one process writes the report and the feature metadata. Concurrent
   reviewers writing shared files corrupt each other's work.
4. **The baseline is the app, not an ideal.** Recommendations are expressed in tokens and components
   the app already has.
5. **Screenshots or it did not happen.** Every finding names the image that shows it.
6. **Coverage honesty beats coverage.** Naming the surfaces you could not reach is part of the
   result.
7. **A tab is a page.** A sweep that stops at the router misses most of the application.
