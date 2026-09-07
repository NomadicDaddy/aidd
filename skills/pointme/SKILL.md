---
name: pointme
description: 'Route a stated goal to the one or two skills or aidd recipes that best accomplish it, with the exact invocation, why it fits, and what it will touch. Use when you know the outcome you want but not which skill, recipe, or pipeline to run next.'
metadata:
    aidd-category: runtime
---

# Point Me

Turn "here is what I want" into "run exactly this". Read the goal, build the catalog that is
actually reachable from here, and name at most two candidates with the reasoning behind the pick.

This skill routes. It does not perform the work it recommends.

## Usage

```
pointme <goal statement> [--in <project-dir>] [--run]
```

- `<goal statement>` → plain language: what should be true when the work is done.
- `[--in <project-dir>]` → route for a different project than the current directory.
- `[--run]` → after presenting the pick, offer to launch it instead of only reporting it.

With no goal, ask for one in a single sentence and stop. Never guess a goal from context.

## Step 1 — Restate the goal as an outcome

Convert the request into (a) the **artifact or subject** it targets, (b) the **verb** — find,
judge, generate, reconcile, change, document, ship — and (c) whether the user wants a **report** or
an **applied change**. "Ensure CONTEXT.md is up to date and accurately reflects current state" is
artifact = `CONTEXT.md`, verb = reconcile, mode = applied change.

Ambiguity in the verb changes the answer more than ambiguity in the artifact. When the goal reads
as both audit and fix, treat it as fix and say so in the output.

## Step 2 — Build the catalog

Run the bundled script once. It resolves the execution context, lists every agent skill reachable
from here, and lists the aidd recipes when an aidd root is reachable:

```bash
for p in "${CODEX_HOME:-$HOME/.codex}/skills/pointme" \
	"$HOME/.claude/skills/pointme" ".claude/skills/pointme" \
	"${AIDD_ROOT:-.}/skills/pointme" ".aidd/skills/pointme"; do
	[ -f "$p/scripts/catalog.sh" ] && POINTME="$p" && break
done
bash "$POINTME/scripts/catalog.sh" [project-dir]
```

The output has three sections:

- `## context` — cwd, resolved `aidd-root` (or `none`), whether `.aidd/` is staged in the target,
  feature count, dirty-file count.
- `## skills` — tab-separated `source · id · aidd-category · description`, merged across the user
  catalog, the project catalog, the aidd catalog, and any plugin catalogs, deduplicated by id.
- `## recipes` — tab-separated `id · name · parameters · step-count · step-skills · description`.

`aidd-root none` is a normal result, not a failure: recommend agent skills only, and do not mention
recipes at all in that case.

## Step 3 — Add the session catalog

The script reads skills that exist on disk. Skills bundled with the harness or supplied by a
connected plugin may be listed in the session only. Merge those in from the available-skills list
you were given, and treat the union as the candidate pool. A name that appears in neither source
does not exist — never invent one, and never recommend a skill you have only inferred from a
recipe step.

## Step 4 — Ground the pick in the target

Spend at most four cheap probes confirming the preconditions of the leading candidates: does the
named artifact exist, when was it last touched, is the tree dirty, does `.aidd/features/` hold
anything. Existence and timestamps only — no full reads, no analysis. The point is to avoid
recommending a skill whose input is missing, not to start the work.

A candidate whose precondition fails is either ruled out or demoted to "do X first".

## Step 5 — Rank

Score candidates in this order; an earlier criterion beats a later one:

1. **Artifact match** — the description names the exact thing the goal names. A skill that owns
   `.aidd/roadmap.json` beats a general documentation skill for a roadmap goal.
2. **Verb match** — a review-only skill cannot satisfy a goal stated as "make it correct", and a
   generator cannot satisfy "tell me whether it drifted".
3. **Precondition fit** — from step 4.
4. **Scope fit** — one artifact vs the whole project vs the fleet; a single action vs a chain.

Break ties toward the narrower skill. Read at most one full `SKILL.md` when two candidates remain
genuinely tied, and say what settled it.

## Step 6 — Choose the runner

The same work can be dispatched three ways. Pick by shape, not by habit:

| Shape of the goal                                                     | Runner                                 |
| --------------------------------------------------------------------- | -------------------------------------- |
| One action, on this project, in this session                          | The skill directly, as a slash command |
| One action, but on another project, or wanted as a recorded run       | aidd CLI `--skill`, from the aidd root |
| A chain the user described end-to-end (do it, review it, document it) | An aidd recipe, launched as a pipeline |
| The same action across several projects                               | One skill or recipe launch per project |

CLI form, run from the aidd root:

```
bun run start -- --project-dir <app-dir> --skill <id> --skill-args "<args>" --skill-intent apply-changes
```

`--skill-intent` defaults to `review-only`; a goal that asks for changes needs `apply-changes`
stated explicitly. Recipes launch from the aidd control panel's recipe launcher and take the
parameters listed in the catalog output — report those parameter names so the user knows what the
launcher will ask for.

Recommend a recipe over a bare skill only when the goal genuinely spans the recipe's chain. If the
goal is one link of it, recommend the link and mention the recipe as the wider option.

## Step 7 — Report

Keep it short enough to act on without scrolling:

```
**Run** — `<invocation>`
Why: one sentence connecting the goal to what this actually does.
Touches: what it reads and what it writes; report-only or applies changes.
First: precondition to satisfy, omitted when there is none.

**Or** — `<invocation>` — the one condition under which this is the better pick.

Ruled out: `a` — reason. `b` — reason.
```

Rules for the report:

- At most two recommendations. A goal needing a sequence is **one** recommendation written
  `A, then B`, not two.
- Every ruled-out entry names a candidate a reasonable reader would have expected, with the
  specific reason it loses — not a generic "less relevant".
- When nothing fits, say so in one line and describe the direct work instead. A forced
  recommendation is worse than none.
- When the goal is already covered by a skill the user is mid-way through, say that rather than
  restarting it.

## Step 8 — Hand off

Stop after reporting. With `--run`, offer the top pick and the runner-up as choices and launch the
selection; without it, leave the invocation for the user to run. Do not start the recommended work
on your own initiative, and do not partially perform it while explaining it.
