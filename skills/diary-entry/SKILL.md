---
name: diary-entry
description: 'Write one project daily-development diary entry from run history, iterations, Git history, features, and changelog evidence. Use when creating or refreshing .aidd/diary/YYYY/MM/DD.md.'
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Diary Entry

Write a single day's development diary entry for the current project, synthesized from the
project's own aidd activity. The entry is saved as a markdown file under `.aidd/diary/` and is
surfaced in the web control panel's per-project **Diary** tab and the global **Diary** page.

## Usage

```
diary-entry
diary-entry --date 2026-06-12
```

## Target File

- `.aidd/diary/YYYY/MM/DD.md` (relative to the project root): one file per calendar day.
- Parent directories (`YYYY/MM/`) are created if missing.
- **Same-day overwrite is allowed.** Unlike the cross-project `devdiary-update`, this skill
  regenerates today's entry on demand (the web "Write today's entry" button re-runs it), and the
  files are git-versioned, so overwriting is safe and intended. Do not overwrite a _different_
  day's entry; only write the file for the resolved target date.

## Frontmatter Schema (write exactly this shape)

The web backend parses this frontmatter deterministically, so emit these keys verbatim. Quote
string values with single quotes; escape an embedded single quote by doubling it (`''`).

```yaml
---
date: 2026-06-12 # required; must equal the date in the file path (YYYY-MM-DD)
project: aidd # required; the project directory name
title: 'The Diary Lands' # required; evocative and specific; falls back to the H1 if omitted
phase: Backend # optional; one of: Architecture | Frontend | Backend | Collector | DevOps | Bugfix | Research | Tooling | Template
summary: 'One-line teaser shown in feed cards.' # optional
generatedBy: '' # optional; leave blank; the runtime fills the generating session id when known
---
```

## Workflow

### Phase 1: Resolve target

1. The current working directory is the project root (web one-shot runs launch with the project
   directory as cwd). Verify a `.aidd/` directory exists; if not, report that this is not an
   aidd-managed project and stop.
2. Resolve the target date: use the `--date` argument if given (validate `YYYY-MM-DD`), otherwise
   today in local time. Compute the day window `[date 00:00, date+1 00:00)` in local time.

### Phase 2: Gather the day's activity

Read only the project's own data; do not scan other projects. Gather, scoped to the day window:

3. **Run ledger**: `.aidd/runs.jsonl` (canonical). Select runs whose start (or completion) falls
   in the window; note mode, status, summary, stop reason, and duration.
4. **Iterations**: for selected runs, inspect matching `.aidd/iterations/*.json` only when the
   ledger entry alone is too thin to describe what happened.
5. **Git log**: commits authored during the window:

    ```bash
    git log --after="<date> 00:00" --before="<date+1> 00:00" --format="%h %ad %s" --date=short
    ```

6. **Feature changes**: `.aidd/features/*/feature.json` whose status or metadata changed on the
   day (created, completed, moved to waiting_approval, etc.).
7. **Changelog**: `.aidd/CHANGELOG.md` entries dated for the day, if present.

### Phase 3: Decide whether to write

8. If the day had no meaningful activity (no runs, no non-trivial commits, no feature or changelog
   changes), **write nothing** and say so plainly in the run summary. Trivial-only days (merge
   commits, automated version bumps) do not get an entry.

### Phase 4: Synthesize and write

9. Choose an evocative, specific `title` (e.g. "The Reconcile Refactor", not "June Updates") and
   the dominant `phase` label.
10. Compose the entry body using this template:

    ```markdown
    ---
    date: 2026-06-12
    project: aidd
    title: 'The Reconcile Refactor'
    phase: Backend
    summary: 'Idempotent diary indexing landed alongside the timeline union endpoint.'
    generatedBy: ''
    ---

    # Friday, June 12, 2026: The Reconcile Refactor

    ## What changed

    - {concrete, specific changes at the file or area level; reference run ids or commits where useful}

    ## Decisions & rationale

    - {key decisions made today and why}

    ## Reflections

    - {insights, lessons, notable patterns; honest and personal}

    ## High level

    {Two or three sentences translating the day's work for a non-technical reader: what problem
    was being solved, why it matters, and what is next. No jargon. This section stands alone.}
    ```

    - The `# H1` uses the full date format: `# Friday, June 12, 2026: Title`.
    - Keep the technical sections precise; keep `## High level` plain-language and self-contained.
    - **Prose style**: unlike the cross-project diary, these entries are the finished product (read
      directly in the web UI, no human editing pass follows), so the prose must read human-written.
      Follow the humanize-docs style contract (`.aidd/skills/humanize-docs/SKILL.md`, staged; or
      `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo); read it before drafting. Minimum bar if unavailable: no aphorism or lesson lines, no
      "X isn't Y - it's Z" contrastive framing, at most one analogy, no punch fragments, no
      em-dashes in body prose, no AI filler (delve, leverage, robust, seamless), and let some
      bullets state facts without landing a point.

11. Write the file to `.aidd/diary/YYYY/MM/DD.md`, creating parent directories as needed. Overwrite
    only if the file is for the resolved target date.
12. Verify the written file is well-formed markdown with valid frontmatter.

### Phase 5: Report

13. Report the target date, the file path written (or that nothing was written), and a one-line
    description of the entry. This skill runs unattended (including inside pipelines and from
    the web button); apply the entry directly and treat the report as informational.

## Notes

- This is a per-project diary. The cross-project personal log lives in the separate
  `devdiary-update` skill and writes elsewhere; the two do not share files.
- Entries should have personality and reflection, not just a dry change list - but personality
  within the humanize-docs contract: honest observations and admitted uncertainty, not crafted
  aphorisms or engineered story beats.
- Because the web UI renders a constrained markdown subset (headings, lists, blockquotes, emphasis,
  inline code), avoid tables and raw HTML in the body.
