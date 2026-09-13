---
name: page-by-page
description: 'Ask one question of every page in a running application — one reviewer subagent per page — then consolidate the answers into a single prioritized report. Use for whole-app review passes on any theme: design polish, accessibility, mobile UX, copy, empty states, or performance.'
metadata:
    aidd-category: audit-remediation
    aidd-contracts: ui-redesign-planner
---

# Page by Page

Run the same review question against every page of a running application, one subagent per page, and
merge what comes back into one report.

The question is the parameter. The machinery — enumerate the pages, fix a shared yardstick, fan out,
consolidate by cause rather than by page — does not change with it.

## Usage

```
page-by-page [app] "<question>" [--url <base>] [--scope <nav-group|prefix>]
             [--viewports <WxH,...>] [--features]
```

```
page-by-page myApp "how could this look cleaner? sleeker? more consistent across the ui?"
page-by-page appXyz "review and improve the accessibility and mobile ux" --viewports 390x844,360x800
page-by-page . "where do empty, loading, and error states fall short?"
```

- Zero args → infer the app from the current repository and the URL from its dev configuration.
- No question → default to `how could this look cleaner? sleeker? more consistent across the UI?`
- `--scope` → limit to one navigation group or route prefix. Use it on large apps.
- `--viewports` → override the default viewport set. The first entry is primary.
- `--features` → also file durable feature records (Phase 7). Default is report only.

For a design-specific pass that reviews **every tab within every page** as its own surface, use
`frontend-design-sweep` instead. This skill's unit of work is the page.

## Applicability

Applies to any project that serves a browsable interface, whatever the stack. The two genuine
preconditions are a **reachable running URL** and **more than one page** to compare. A CLI, a
library, or a single-screen tool has nothing for this skill to do — say so and stop.

This skill never edits product code.

**Probe for browser automation before concluding it is missing.** Run `agent-browser --version`.
It is a CLI reached through the `agent-browser` skill, not a registered tool. This review cannot
substitute source inspection for observed browser evidence, so stop with the installation guidance
if the probe genuinely fails.

## Phase 0: Resolve the target and fix the run conditions

| Input          | Default                                                           |
| -------------- | ----------------------------------------------------------------- |
| App directory  | Current repository, or the named application root                 |
| Question       | The quoted argument, or the design default above                  |
| Base URL       | Frontend URL from the project's own dev configuration             |
| Run id         | `{RUN}` = `YYYYMMDD-HHMM`; `{SLUG}` = 3–4 words from the question |
| Screenshot id  | `{ID}` = `-HHmmss-page-by-page-{SLUG}`                            |
| Work directory | `{app}/.aidd/reports/page-by-page/{RUN}-{SLUG}/`                  |
| Screenshots    | `{app}/.aidd/screenshots/{YYYYMMDD}{ID}/` (absolute)              |
| Viewports      | `2250x1309`, `2560x1440`, `1920x1200`, `1440x900`                 |
| Theme          | The app's default theme, applied to every page                    |
| Authentication | The highest role the user authorizes; anonymous otherwise         |

Discover the start command from the project's own manifest. If the app is not already reachable,
start it, record that this run owns the process, and wait for the URL to respond. Leave a
pre-existing process alone.

If the app serves a built bundle instead of a live dev server, rebuild and restart it before
capturing anything. Record the commit under review so a stale bundle cannot masquerade as current
behavior.

**Restate the question back to the user before fanning out**, along with the page count. A vague
question multiplied across sixty reviewers produces sixty vague reports. If the question does not
imply what a good answer looks like, sharpen it first — one clarifying exchange is cheaper than a
whole sweep.

Fix theme, viewport, and role once and hold them for the run. Pages captured under different
conditions cannot be compared.

Resolve `{RUN}`, `{YYYYMMDD}`, and `{ID}` once from the same local run-start time after resolving
`{SLUG}`. Resolve `{app}` to its absolute path before passing the screenshot destination to browser
automation; its daemon may have a different working directory. If the screenshot directory already
exists, append `-2`, then `-3`, and so on to `{ID}` until the path is unused. Never overwrite an
earlier run.

Never write to an existing work directory or report. Stop and report the collision; generated
`.aidd/` evidence is often ignored and may have no Git history from which to recover.

Measure motion once in the parent with
`matchMedia('(prefers-reduced-motion: reduce)').matches` and the computed `animation-duration` of
one element the app actually animates. Record the result in the baseline and give every reviewer
that same run condition.

## Phase 1: Choose the review lens

The question decides which lens each reviewer applies. Pick one before dispatching and put it in
every prompt:

| Question theme                            | Lens                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Visual design, polish, consistency        | `frontend-design` review instructions when available; otherwise `ui-redesign-planner` Phase 2 fallback |
| Accessibility, keyboard, contrast         | `rams`, or the app's own accessibility audit                                                           |
| Interface conventions, component patterns | `web-design-guidelines`                                                                                |
| Load, responsiveness, Core Web Vitals     | `web-perf`                                                                                             |
| Anything else                             | No skill — the question itself is the whole instruction                                                |

Use a skill only when one genuinely matches. An unmatched question is not a degraded run: a clearly
stated question is a complete instruction, and inventing a lens the question did not ask for is how
sweeps drift off-topic. Record which lens ran in the report.

For the visual-design lens, follow the staged `ui-redesign-planner` Design review source rules.
Verify the exact source and invocation permissions, then pass the same permitted review procedure
to every reviewer. Record why a scoped replacement was selected, its omissions, and any evidence
limits. Do not treat a missing catalog entry as proof of an uninstalled skill or bypass a restriction.

## Phase 2: Enumerate every page

Build the page list from these sources in order, adding what each contributes:

1. `{app}/.aidd/screen-map.md` when present — the fastest authoritative route list.
2. The router configuration, for routes the screen map missed or that post-date it.
3. The navigation configuration, for reachability order and role gating.

What counts as one page:

- **One route, one page.** A nested route with its own URL (`/explorer/databases`) is its own page.
- **Tabs inside a page belong to that page.** The reviewer opens them while reviewing the page and
  reports on the page as a whole. A tab does not get its own reviewer.
- **Parameterized routes need a real record.** Reach `/thing/:id` by navigating from its list page
  and taking the first row. Never invent an id or report the resulting not-found page.
- **Dialogs and drawers** belong to the page that opens them, and only when they carry real work.

Group pages by the role required. A page you cannot authenticate into is **unreached**, not a
finding. Never report an authorization block, or an empty state caused by absent data, as a defect.

Write the work list to `{work}/pages.json`:

```json
{
	"id": "explorer-databases",
	"label": "Explorer — Databases",
	"minRole": "VIEWER",
	"route": "/explorer/databases",
	"source": "screen-map",
	"tabs": ["Overview", "Schema"],
	"url": "http://localhost:5173/explorer/databases"
}
```

Report the page count and the excluded set before fanning out. Above roughly forty pages, confirm the
scope with the user or shard the run by navigation group.

## Phase 3: Fix the baseline before fanning out

Do this once, in the parent, and paste the result into every reviewer prompt. Without a shared
yardstick each reviewer answers against its own standard, their answers contradict each other, and
consolidation produces mush.

The digest describes **what the app already does in the dimension the question asks about** — for a
design question, its tokens, type scale, spacing rhythm, and shared components; for accessibility,
its existing focus, labelling, and landmark patterns; for copy, its established voice. Name two or
three **exemplar pages** that do it best; they become the reference for every "inconsistent with the
rest of the app" judgment.

Fix the finding `category` vocabulary here too — a small tag set drawn from the question's own terms.
A free-for-all vocabulary cannot be clustered afterwards.

Keep it under 400 words and save it to `{work}/baseline.md`. It is the ruler, not the redesign.

## Phase 4: Fan out — one reviewer per page

Run one subagent per page in batches sized to the runtime's available concurrency. Dispatch each
batch together so its reviewers run concurrently. If the runtime has no subagents, walk the same
procedure sequentially and say so.

Give each reviewer its own browser session (`pbp-{RUN}-{n}`) and require it to close that session.
Concurrent reviewers sharing one session navigate each other's tabs out from under themselves.

Prompt template:

```text
Review one page of {app} and answer this question about it:

  {question}

Page: {label} — {url}
Tabs on this page to open while reviewing: {tabs, or "none"}
Viewports: {viewport list, in order}. Set each viewport explicitly before its capture.
Session: pbp-{RUN}-{n}
Lens: {lens invocation from Phase 1, or "none — the question is the instruction"}

Judge "consistent with the rest of the app" against this baseline, not your own taste:
{baseline digest}

Evidence, before judging anything:
  - screenshot at each viewport into {screenshots}/{page-id}-{viewport}.png
  - an interactive snapshot
  - console and error output

WRITE RULE: write only your screenshots and {work}/findings/{page-id}.json. Do NOT create
or modify any report, feature.json, roadmap, or product source. Other reviewers are running
concurrently and the caller does the consolidation.

Do not report: authorization blocks, empty states caused by absent data, loading skeletons,
or anything you did not see on screen. Motion in this run: {motion state measured in Phase 0}.
Confirm against the code before calling an animation absent.

Return findings as JSON matching {schema}, tagged with the category vocabulary above. Return
an empty array rather than padding with generic advice.
```

Finding schema — one object per observation:

| Field             | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| `page`            | Page id                                                                           |
| `where`           | The component or region it lives in, named as the codebase names it               |
| `category`        | A tag from the Phase 3 vocabulary                                                 |
| `severity`        | `P1` blocks or badly degrades a task \| `P2` real cost to the user \| `P3` polish |
| `observation`     | What is on screen, stated so someone else can verify it in the screenshot         |
| `proposal`        | The concrete change, expressed in the app's existing patterns and components      |
| `scope`           | `local` to this page, or `systemic` if the reviewer believes it repeats           |
| `sharedComponent` | The shared component the fix belongs in, when the finding traces to one           |
| `evidence`        | Screenshot path                                                                   |

If a reviewer fails or its page will not load, record the page as unreached with the reason. Never
fill the gap by guessing what that page probably looks like.

## Phase 5: Consolidate

Cluster by **cause** — component and category — not by page. This is the step the fan-out exists to
enable.

1. **Merge.** Identical proposals across pages collapse into one finding listing every page it was
   seen on. Keep the clearest screenshot.
2. **Promote.** A finding on three or more pages, or traced to a shared component, becomes systemic.
   Its fix belongs in the shared layer, never as N per-page edits.
3. **Resolve conflicts.** When two reviewers propose opposite directions for the same component, the
   Phase 3 exemplars decide. Record the rejected alternative and why it lost.
4. **Cut.** Drop findings with no evidence, duplicates of one root cause, anything that does not
   answer the question, and anything generic — if a recommendation would read identically against a
   different application, it is not a finding.
5. **Rank.** By severity in the question's own terms, then by how many pages each affects.
6. **Sequence.** Order fixes so shared-layer changes land first, and mark the local findings each
   systemic fix should absorb. Implementing absorbed findings first wastes the work twice.

## Phase 6: Report

Write `{work}/page-by-page-{SLUG}.md`, beside the pages, baseline, and findings that produced it.
Then append one line to `{app}/.aidd/reports/page-by-page/index.md`, creating it if absent:

```text
| {RUN} | {SLUG} | {viewports} | {commit} | {pages reviewed}/{enumerated} | {P1}/{P2}/{P3} | page-by-page/{RUN}-{SLUG}/page-by-page-{SLUG}.md |
```

Append only; never rewrite the index.

- **Run header** — the question verbatim, lens used, URL, theme, viewports, role, date, and pages
  enumerated, reviewed, and unreached.
- **Answer** — three to five sentences answering the question for the application as a whole. A
  reader who stops here should still have the finding.
- **Coverage table** — every page marked `visited`, `partial`, or `unreached` with a reason. List the
  unreached ones explicitly; a sweep that hides its gaps is worse than a smaller sweep that names
  them.
- **Baseline digest** — carried from Phase 3.
- **Systemic findings** — the component, pages affected, observation, proposed change in existing
  patterns, and acceptance criteria an implementer can check.
- **Local findings** — grouped by page, with absorbed-by-systemic ones marked.
- **Screenshot index** — page to evidence path.

Do not describe the sweep as complete unless every row of the coverage table says `visited`.

## Phase 7: Feature records (opt-in)

Only with `--features`, or when the user asks. Hand the consolidated findings to
`ui-redesign-planner {app} --source {work}/page-by-page-{SLUG}.md`, or to whichever intake the
project already uses, and let it own feature metadata, milestone assignment, and validation. Do not
write feature JSON directly from this skill.

## Cleanup

1. Confirm every reviewer closed its browser session; close any that remain.
2. Stop the application only if this run started it.
3. Report every page visited, every command run, and anything left running.

## Principles

1. **The question is the contract.** Every reviewer gets it verbatim, the report answers it directly,
   and findings that do not answer it are cut however interesting they are.
2. **Reviewers observe; the caller judges.** Independent observations stay uncontaminated, and one
   place holds the whole picture.
3. **One writer.** Exactly one process writes the report and any feature metadata. Concurrent
   reviewers writing shared files corrupt each other's work.
4. **The baseline is the app, not an ideal.** Recommendations are expressed in patterns the app
   already has.
5. **Screenshots or it did not happen.** Every finding names the image that shows it.
6. **Coverage honesty beats coverage.** Naming the pages you could not reach is part of the result.
