---
name: ux-rethink
description: 'Question whether an existing site or UI is the right design at all: who uses it, the tasks they come for, how many steps each task costs today, whether the structure matches the users or the code, what should not exist, and two or three genuinely different concepts scored against the current UI on the same tasks. Use when planning a redesign, when an interface works but feels wrong, or when polish keeps failing to fix it. Not for styling, accessibility or performance.'
metadata:
    aidd-category: audit-remediation
    aidd-contracts: ui-redesign-planner
---

# UX Rethink

A first-principles review of an existing interface. Other skills start from the existing screens and
ask how to make them better; this one asks whether they are the right design at all: is this the
right presentation, is it intuitive, is it easy to use, is it effective for the people who use it.
It ends in a recommendation and its cost, not in code: the chosen concept's visual design goes to
`ui-redesign-planner` afterwards.

## Usage

```
ux-rethink [app] [url] [--users <who>] [--tasks <file>]
```

- `[app]`, `[url]`: the application and where it runs. Zero args means the current repository and
  the URL from its own dev configuration.
- `--users`, `--tasks`: supply the users or the task list when the owner already knows them. They
  are still checked against evidence in Phase 1, never taken as proven.

## What this is not

| Question                                    | Use instead                     |
| ------------------------------------------- | ------------------------------- |
| Does it look clean and consistent?          | `frontend-design-sweep`         |
| Is it accessible?                           | `rams`, `web-design-guidelines` |
| Is it fast?                                 | `web-perf`                      |
| One question asked of every page            | `page-by-page`                  |
| Plan the visual redesign of a chosen design | `ui-redesign-planner`           |

Leave colour, type, spacing and contrast out of every finding here. A finding that would be fixed by
restyling belongs to one of the skills above.

## Phase 0: Run conditions

1. Open one real surface of the running app with the browser tool and require it to load within 60
   seconds. Record which tool drove the run. Stop if nothing can open the app: this review cannot
   be done from source, because every count in it is a count of what a person actually does.
2. Use realistic data. An empty database hides most of the decisions a real user faces; seed or
   reuse a representative dataset and say which. Seeded rows must match the formats the app
   validates (ids, enums, dates) even where the database column accepts anything; otherwise the
   walk records the fixture's errors as the product's.
3. Use throwaway credentials only. Screenshots go into backup mirrors whatever `.gitignore` says.
4. Write everything under `{app}/.aidd/reports/ux-rethink/{RUN}/` (`{RUN}` = `YYYYMMDD-HHMM`) and
   never overwrite an earlier run. Screenshots go in `screenshots/` inside it.

## Phase 1: Users and their tasks

1. Name the users: the distinct jobs or use cases that bring people to this interface, from the
   spec, README, `.aidd/assertions.md`, support history, and how the owner actually uses it. Cite
   the source for each. A user nobody can evidence is listed as assumed. These are not permission
   tiers: two users with different jobs may hold the same role.
2. List the five to ten tasks those users come for, most frequent or most consequential first.
   Write each as an outcome, never as a screen: "As an operator, I need to know which teammate is
   blocked, done when I can see who and why" - not "use the roster panel". A task phrased in the
   current UI's vocabulary has already accepted the current design.
3. For each task record how you know it matters (usage, the owner's words, an issue, a spec clause)
   or mark it assumed. Name the permission role that would do it in practice. Show this list to the
   owner before Phase 2 when they are reachable; a wrong task list makes every later number wrong.

## Phase 2: Walk every task through the current UI

Perform each task in the running app, start to finish, and record each step: the screen, the action,
any decision the user must make, and whether the page or view changed. Screenshot every step. Then
count, per task:

| Measure          | Counts                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| Steps            | Discrete user actions: click, type, choose, scroll to find               |
| Page changes     | Navigations or full view swaps                                           |
| Decisions        | Points where the user must choose without the UI having narrowed it      |
| Dead ends        | Paths a reasonable user would take that do not lead to the outcome       |
| Hidden knowledge | Things the user must already know: a menu location, a code, a convention |
| Recoveries       | Undo, back, re-entry needed after an expected misstep                    |

Count what happened on screen, not what the source says should happen. When a task cannot be
completed, record where it stopped; that is a finding, not a gap in the review.

Walk each task signed in as the role named for it in Phase 1, and start it from a clean entry, with
no filter or selection carried over from the previous task. A filter that silently carries over is
itself hidden knowledge: record it, then restart the task clean.

Before recording a stop, classify it:

- **Structural**: the task has no home, or its path follows the implementation. Feeds Phases 3-5.
- **Defect**: a control exists in the right place and does not work. List it separately; it is
  ordinary repair work, and Phase 6 scores concepts as if defects were fixed.
- **Artefact**: caused by the run, not the product: the wrong role, seeded data, missing collected
  data, or the browser tool. Withdraw it. Before calling an input broken, show the tool can fill a
  comparable input on that page another way (for example keystrokes instead of a fill). Before
  recording emptiness as a finding, ask whoever owns the data whether it is expected.

## Phase 3: Whose model is the structure?

Inventory the navigation, page names, object names and groupings, and compare each with the words
and grouping the users and tasks use. Flag where the structure follows the implementation instead:

- One page per database table or API resource rather than per task.
- Internal names on screen: a component, a service, a field name, a status enum.
- Information a task needs split across places because the code stores it apart.
- Grouping by who built it, or by when it was added.

For each mismatch, give the user's term and the screen's term side by side, and the task it costs.

## Phase 4: What should not exist

List screens, controls, settings, steps and confirmations that no Phase 1 task needs, that duplicate
another path, or that leave the user a decision the product could make. For each, say what would
be lost by removing it, and who would notice. Removal is a legitimate recommendation, and often the
cheapest one with the largest effect.

## Phase 5: Two or three genuinely different concepts

Design alternatives that differ in their organising principle, not in their arrangement. Examples
of different principles: task-first versus object-first, an inbox of things needing attention versus
a dashboard of everything, one workspace versus separate tools, timeline versus status board.

**The difference test:** if two concepts' walkthroughs differ only in labels or positions, they are
one concept. Replace one.

For each concept give:

1. The principle, in two or three sentences, and which users it serves best.
2. A layout sketch of its main screens (ASCII or a simple wireframe image), enough to walk tasks on.
3. A walkthrough of every Phase 1 task, counted with the same Phase 2 measures.
4. What it removes or merges from Phase 4, and what it newly needs that does not exist yet.

Include the current UI, lightly corrected for its worst Phase 3 mismatches, as a baseline concept
when that is a realistic option. Keeping the current structure can be the right answer.

## Phase 6: Score and recommend

1. One table: tasks as rows, the current UI and each concept as columns, each cell the Phase 2
   measures. Total them, and weight by task frequency where the frequency is evidenced.
2. Cost each concept honestly: build effort, data or API changes it needs, what existing users must
   relearn, bookmarks and habits it breaks, and **which tasks it makes worse**. A concept that wins
   every task is usually one whose costs have not been looked for.
3. Recommend one, with its cost and the evidence that carries the decision. Say what would change
   the recommendation. If the evidence does not separate the concepts, say that rather than picking.

The decision is the owner's. Do not file features or change code from this skill.

## Report

Write `{app}/.aidd/reports/ux-rethink/{RUN}/ux-rethink.md` containing, in order:

- The users and task list with their evidence, and what was assumed.
- The current-UI walkthrough per task with its role, counts and screenshot paths.
- Defects, and withdrawn artefacts with what showed each was not the product.
- Mental-model mismatches (Phase 3) and removal candidates (Phase 4).
- Each concept: principle, sketch, walkthrough, counts, removals and new needs.
- The scoring table, the costs, the recommendation and what would change it.
- Run conditions: browser tool, dataset, roles used, commit measured, and anything not reached.

After the owner chooses, hand the chosen concept to `ui-redesign-planner` for its visual design and
remediation records, and any net-new behaviour to `spec`.

## Anti-patterns

| Anti-pattern                                 | Instead                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| Tasks written as screens ("open the X page") | Outcomes a user wants, in their words                      |
| Counting steps from source or memory         | Perform the task in the running app, screenshot it         |
| Three layouts of the same idea               | Different organising principles; apply the difference test |
| Restyling suggestions                        | Leave them to `frontend-design-sweep`                      |
| A concept that wins everything at no cost    | Look for the tasks it makes worse and what it breaks       |
| Recommending change by default               | Keeping the current structure is a valid outcome           |
| Filing features or editing code              | Report and recommend; the owner decides                    |
