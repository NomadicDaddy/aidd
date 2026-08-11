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
frontend-design-sweep [app] [url] [--mode <desktop|tablet|mobile>] [--viewports <WxH,...>]
                      [--scope <nav-group|route-prefix>] [--features]
```

- Zero args → infer the app from the current repository, and the URL from its dev configuration.
- `--mode` → the viewport class this sweep runs at. Default `desktop`. A run at one mode is not
  comparable to a run at another and never overwrites it — see Phase 0.
- `--viewports` → override the mode's default viewport set. First entry is the primary viewport.
- `--scope` → limit the sweep to one navigation group or route prefix. Use it for large apps.
- `--features` → also file remediation features (Phase 6). Default is report only.

The mode may also arrive in prose — "mobile mode", "desktop 1600x1200". Resolve it to a `{MODE}`
slug in Phase 0 and carry that slug into every path this run writes. **Never run a sweep whose mode
you did not resolve**; a mode-less run produces a report that silently collides with the last one.

The review question is fixed here: how the UI could look cleaner, sleeker, and more consistent. To
ask a different question — accessibility, mobile UX, copy, empty states — use `page-by-page`, which
takes the question as an argument and reviews one page at a time rather than one tab at a time.

## Applicability

Applies to any project that serves a browsable interface, whatever the stack. The two genuine
preconditions are a **reachable running URL** and **more than one surface** to compare. A CLI, a
library, or a single-screen tool has nothing for this skill to do — say so and stop.

This skill never edits frontend code. Hand approved changes to `ui-playground-apply`,
`spernakit-apply-ui`, or ordinary implementation work.

**Probe for browser automation before concluding it is missing.** Run `agent-browser --version`. It
is a CLI reached through the `agent-browser` skill, **not a registered tool** — a search of the tool
registry finds nothing and proves nothing. A sweep cannot run without it, so establish this in Phase
0 and stop with the install instruction if the probe genuinely fails. Never substitute reading
source for looking at the screen: a visual claim derived from source is a hypothesis, and this skill
exists to test hypotheses against pixels.

## Phase 0: Resolve the target and fix the run conditions

| Input          | Default                                                   |
| -------------- | --------------------------------------------------------- |
| App directory  | Current repository, or the named application root         |
| Base URL       | Frontend URL from the project's own dev configuration     |
| Mode           | `{MODE}` = `desktop` unless the invocation says otherwise |
| Run id         | `{RUN}` = `YYYYMMDD-HHMM`                                 |
| Work directory | `{app}/.aidd/reports/design-sweep/{RUN}-{MODE}/`          |
| Screenshots    | `{app}/screenshots/design-sweep/{RUN}-{MODE}/`            |
| Viewports      | The mode's set, below, unless `--viewports` overrides it  |
| Theme          | The app's default theme, applied to every surface         |
| Authentication | The highest role the user authorizes; anonymous otherwise |

| `{MODE}`  | Viewports, in capture order — the first is the primary |
| --------- | ------------------------------------------------------ |
| `desktop` | `2560x1440`, `2250x1309`, `1920x1200`, `1440x900`      |
| `tablet`  | `1024x768`, `768x1024`                                 |
| `mobile`  | `390x844`, `360x800`                                   |

Every viewport in the set is captured on every surface, in the order listed. The primary is the one
findings are written against; the rest exist to catch what only breaks at another width.

Resolve `{MODE}` **before anything else** and echo it back with the resolved viewports. If the
invocation names a viewport but no mode, derive the mode from the primary width (≥1280 `desktop`,
≥600 `tablet`, otherwise `mobile`) and record the override. If the invocation is ambiguous, ask —
do not default silently, because the mode names every path this run writes.

Discover the start command from the project's own manifest. If the app is not already reachable,
start it, record that this run owns the process, and wait for the URL to respond. Leave a
pre-existing process alone.

**Verify the running build is current.** If the app serves a built bundle rather than a live dev
server, rebuild and restart it before capturing anything, and say in the report which commit the
sweep measured. A sweep of a stale bundle reports fixed defects as open ones.

**Fix theme, viewport, and role once and hold them for the whole run.** Surfaces captured under
different conditions cannot be compared, and comparison is the entire point.

**Measure the motion state; never assume it.** Whether the sweep browser reports reduced-motion is a
property of this machine, this browser build and this run's flags — it changes without notice, so it
is a run condition to establish, not a fact to carry between runs. In the sweep browser, evaluate
`matchMedia('(prefers-reduced-motion: reduce)').matches` and the computed `animation-duration` of one
element the app actually animates. Record both in the baseline and pass the result into every
subagent prompt. A stale assumption here silently suppresses a whole finding category: reviewers told
motion is forced off stop reporting motion at all.

**Never write to a path that already exists.** Every artifact of this run — work directory,
screenshots, report — carries both `{RUN}` and `{MODE}`, so two sweeps cannot collide even at the
same minute. If a target path exists, stop and report it rather than overwriting: `.aidd/` is
gitignored in many projects, so an overwritten report has no history to recover from and is simply
gone.

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
Mode: {MODE} — viewports {viewport list, in order}. Cover every one of them. Set the
viewport explicitly before every capture; do not rely on the browser's default.
Session: ds-{RUN}-{MODE}-{n}

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
skeletons, or anything you did not see on screen. Motion in this run: {motion state,
measured in Phase 0}. Whatever it says, confirm against the code before calling an
animation absent — absence is easy to misread from a static screenshot.

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

Write `{work}/ui-design-sweep-{MODE}.md` — inside this run's own work directory, so the report sits
with the findings, baseline and `surfaces.json` that produced it and cannot overwrite another run's.
Then append one line to `{app}/.aidd/reports/design-sweep/index.md`, creating it if absent:

```text
| {RUN} | {MODE} | {viewports} | {commit} | {surfaces reviewed}/{enumerated} | {P1}/{P2}/{P3} | design-sweep/{RUN}-{MODE}/ui-design-sweep-{MODE}.md |
```

Append only. Never rewrite the index, and never write a mode-agnostic `ui-design-sweep.md` at the
top level — that filename is what let a mobile sweep destroy the desktop sweep's consolidated report.

The report contains:

- **Run header** — URL, theme, mode, viewports, role, date, commit under test, surfaces enumerated,
  reviewed, unreached.
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

Every feature filed from this sweep must name, in its acceptance criteria, **the mode and viewport
the fix will be verified at** and the screenshot path that will show it. A visual feature whose spec
does not say where to look invites closure on source reasoning — see Phase 7.

## Phase 7: Verify the remediation (required when Phase 6 ran)

Remediation is not finished when the features close. It is finished when a sweep at the same mode
shows the defects gone and nothing new in their place. **Every remediation pass gets a verification
sweep; the last one in a sequence is the one most likely to be skipped and the only one with nothing
downstream to catch it.**

After the features from this run are implemented:

1. Re-run this skill at the **same `{MODE}`** against the rebuilt application, scoped to the surfaces
   the remediation touched. It gets its own `{RUN}` and its own report; it does not edit this one.
2. Diff the two runs' findings. Report three counts: **resolved** (present before, absent now),
   **persisting** (present in both), and **introduced** (absent before, present now).
3. Treat every introduced finding as a regression caused by the remediation, and file it as such
   rather than as an ordinary new finding. Remediation at the shared-component layer changes surfaces
   nobody edited, which is exactly why this pass exists.
4. A shared-layer fix that changed control sizing, spacing, or type scale invalidates every height
   cap, clamp, and truncation tuned against the old values. Re-capture the surfaces that carry them
   even when no feature named them.

A remediation reported as complete without this pass is unverified. Say so in the report rather than
implying it was checked.

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
8. **Every artifact carries its run and mode.** Reports are evidence; a filename that two runs can
   claim is a filename that loses one of them.
9. **Remediation is verified by re-sweeping, not by closing features.** The fix and the proof that it
   worked are two separate pieces of work.
