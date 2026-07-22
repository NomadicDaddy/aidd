---
name: devdiary-update
description: 'Review recent activity across application repositories and propose development diary and story updates. Use to update the dev diary or devlog, or capture recent cross-project work.'
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Dev Diary & Dev Story Update

Review recent development activity across all projects in `<applications-root>/` and propose updates to the development diary (per-day entry files) and development story (narrative retrospective).

## Usage

```
devdiary-update
```

## Target Files

- **Technical diary entries**: `<applications-root>/devdiary/entries/YYYY/MM/DD.md` - Detailed technical log with code changes, architectural decisions, and technical reflections
- **Non-technical diary entries**: `<applications-root>/devdiary/entries/YYYY/MM/DDhl.md` - High-level narrative entry suitable for non-technical audiences (family, friends, stakeholders)
- **Dev story**: `<applications-root>/devdiary/entries/devstory.md` - Narrative retrospective

## Entry Types

### Technical Entry (DD.md)

Technical entries capture the detailed work for future reference and technical continuity:

**Content focus:**

- Specific code changes and their locations
- Technical decisions and rationale
- Architecture patterns and trade-offs
- Problem-solving approaches
- Technical constraints and workarounds
- Library/framework choices
- Database schema changes
- API endpoints added/modified
- Build and deployment changes

**Tone:** Precise, technical, detailed; assumes programming knowledge

**Audience:** Future self, other developers, technical maintainers

### Non-Technical Entry (DDhl.md - "high level")

Non-technical entries are a **plain-language fact sheet**: raw material a human can later draft a blog post or story from. They are NOT finished prose. Voice, analogies, and lessons get added by the human (or by a deliberate pass with the humanize-docs skill) - never by this skill.

**Content focus:**

- What problem was being solved (in plain language)
- Why it mattered (user-facing benefit, business value)
- What was accomplished (features delivered, bugs fixed, progress made)
- How long it took
- Concrete moments worth telling later - recorded as verbatim detail (what happened, the numbers, the error message), NOT as a framed anecdote with a punchline
- What's next (plain language roadmap)

**Tone:** Plain, factual, jargon-free. A bullet list a family member could follow.

**Audience:** The human author drafting a future post; secondarily family, friends, non-technical stakeholders

**Translation guidelines:**

- Replace technical terms with plain language equivalents where possible
    - "Added TypeScript types to API client" → "Made the app more reliable by defining clear rules for how data flows"
    - "Refactored authentication flow" → "Improved how users log in - fewer bugs, smoother experience"
    - "Migrated to Elysia framework" → "Upgraded the engine that powers the website - it's faster and more maintainable"
- Focus on outcomes, not implementation
- Record facts and specifics; do not narrativize them

**Style constraints (both entry types, hard rules):**

These are the highest-risk subset of the humanize-docs rules; the full style contract is `.aidd/skills/humanize-docs/SKILL.md` (staged; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo) and applies to every piece of prose this skill writes. They exist because generated "engaging" prose reads as AI-written and is nearly impossible to humanize afterward. Do not produce:

- Aphorism or lesson lines ("Rewrites are tuition, not waste", "Silence is not proof")
- Contrastive framing ("X isn't Y - it's Z", "the difference between A and B")
- Analogies of any kind - record the fact; the human adds the analogy if they want one
- Punch fragments ("Filed, fixed.")
- Numbered "what this taught me" lists - a single plain "possible lesson:" bullet is the maximum
- Paragraphs engineered to land a point or button
- Em dashes and en dashes (`—` and `–`) anywhere in prose - use a plain hyphen or restructure the sentence. This includes bullet lead-ins (`**project 1.2.3 — summary.**`), which is where they concentrate; write `**project 1.2.3: summary.**` or split into two sentences. Leave dashes inside code spans, paths, and fenced blocks alone.

**Reflections: required shape.**

A `Reflections:` bullet records an observation and the specific thing it was observed in. It is not the place to say what the observation means in general. Every bullet must name its anchor - a file, a project, a version, a run, a number. A sentence that would still parse and still sound true with every specific detail deleted is a maxim; either put the specifics back or drop the bullet.

- Good: `possible lesson: smoke:qc reported a pass in aidd on a cached run that had skipped the test suite entirely`
- Bad: `possible lesson: a passing gate is only evidence if you have seen it fail on the defect it is supposed to catch`

Zero reflection bullets is a valid outcome for a day. Do not manufacture one, and do not order the bullets so the broadest sits last - the final bullet gets read as the entry's conclusion, which is how these turn into aphorisms.

## Instructions

### Phase 1: Determine Last Update Dates

1. **Find the most recent diary entry** by listing files in `<applications-root>/devdiary/entries/` recursively and identifying the newest `YYYY/MM/DD.md` OR `YYYY/MM/DDhl.md` file by path (lexicographic sort). Parse the date from the path. This is the diary cutoff date.

2. **Read devstory.md** and find the `_Last updated:` footer line. Parse the date (format: `Month DD, YYYY`). This is the story cutoff date.

3. **Use the older of the two dates** as the scan start date. If either source is missing or
   unparseable, fall back to the other one; if neither parses, scan the last 30 days. State the date
   and rationale in the report, then continue directly.

4. **Report the dates** to the user before continuing:
    - Last diary entry: {date} ({path})
    - Dev story last updated: {date}
    - Scanning for activity since: {scan start date}

### Phase 2: Scan Git Repositories

5. **Discover repositories**: List all directories in `<applications-root>/`, `<public-root>/`, `<auto-root>/`, `<pocs-root>/`, `<queue-root>/`, and `<spernakit-workspace-root>/` that contain a `.git` directory.

6. **Scan each repo** for commits since the scan start date:

    ```bash
    git -C <applications-root>/{repo} log --oneline --after="{scan-start-date}" --format="%h %ad %s" --date=short
    ```

    Run all git log commands in parallel since they are independent. Record per repo:
    - Total commit count
    - Date range of commits
    - Notable commit messages (version tags, major features, architecture changes)

7. If **zero repos** have commits since the cutoff, report "No significant changes since {date}" and stop.

### Phase 3: Read Supporting Data Sources

For each repository that had commits since the cutoff, read the relevant data sources. Skip repos with zero commits.

8. **Read changelogs**: for each repo, check these locations in order and read the first one found
   with entries after the scan date:

    1. `.aidd/CHANGELOG.md`
    2. `docs/CHANGELOG.md`
    3. `CHANGELOG.md`

    Different projects use different ones; do not assume a given repo has any particular file, and
    do not skip a repo just because the first location is missing.

    Only extract entries dated after the scan start date. For long files, use date headers to find the relevant section; do not read the entire file.

9. **Read roadmap and feature metadata** (if they exist), in each repo:

    - Roadmap: `.aidd/roadmap.json`
    - Feature metadata: `.aidd/features/*/*.json`

    Both are optional. A repo with neither is still in scope for the diary; it just contributes
    commit history rather than planned-work context.

10. **Read package.json** for each active project to get current version numbers.

### Phase 4: Synthesize Findings

11. **Group commits by calendar day**. Each day with meaningful development activity gets its own entry file. Days with only trivial commits (merge commits, automated version bumps) do not get entries.

12. For each day, determine:
    - Which projects were active and what happened in each
    - The dominant **Phase** label: Architecture | Frontend | Backend | Collector | DevOps | Bugfix | Research | Tooling | Template
    - Key decisions made and their rationale
    - Reflections: observations worth recording, each anchored to the file, project, version, or run it came from (see "Reflections: required shape" above). None is an acceptable answer.

13. **Cross-project synthesis**: When multiple projects advanced together on the same day (e.g., Spernakit release + derived app upgrades), synthesize them into a single coherent entry for that day.

### Phase 5: Draft Diary Entries

14. **Draft TWO new entry files** for each day that warrants one: one technical (`DD.md`) and one non-technical (`DDhl.md`):

**Technical entry format (DD.md):**

    ```markdown
    # DayOfWeek, Month DD, YYYY: Title

    **Phase:** {phase}

    **What changed:**

    - {bulleted list of concrete changes, organized by project if multi-project}

    **Decisions & rationale:**

    - {explanation of key decisions}

    **Reflections:**

    - {observations, each naming the file, project, version, or run it came from; omit the section entirely if the day produced none}
    ```

**Non-technical entry format (DDhl.md):**

    ```markdown
    # DayOfWeek, Month DD, YYYY: Title

    **What happened:**

    - {plain-language bullets: what was built/fixed/decided, why it mattered, who benefits}

    **Numbers and specifics:**

    - {counts, versions, durations, error messages, and names; verbatim detail worth telling later}

    **How it went:**

    - {flat bullets: what was hard, what went smoothly, and anything amusing; facts only, no framing}

    **What's next:**

    - {plain language look-ahead}
    ```

    - The `# H1` heading uses full date format: `# Wednesday, February 19, 2026: Title`
    - Titles are plain and factual (e.g., "Spernakit v3.1.29 and fleet upgrade", "Deleted the auto-apply script"), not clever or evocative - the human names the post later if one gets written
    - Technical file path: `<applications-root>/devdiary/entries/YYYY/MM/DD.md`
    - Non-technical file path: `<applications-root>/devdiary/entries/YYYY/MM/DDhl.md`
    - Create parent directories (`YYYY/MM/`) if they don't exist
    - Ensure both entries cover the same day's activities but with appropriate audience and tone

### Phase 6: Evaluate Dev Story Milestone Criteria

15. **Evaluate whether devstory.md needs a new narrative section.** Add one ONLY if any of these occurred:
    - A new application framework or template era began
    - A major architectural pivot happened (new stack, new paradigm)
    - A project achieved a significant milestone (first production release, v1.0)
    - A new tool or methodology was introduced that changed the development workflow
    - A project was rebuilt, retired, or fundamentally restructured

    **Do NOT add a section for:** routine features, version bumps, audit remediations, incremental template improvements.

16. If a milestone IS warranted, draft a narrative section:
    - Use a plain header naming the milestone (e.g., `### Spernakit v2 rewrite`), not a thematic one
    - Write in prose, not bullet points - but the style constraints above apply in full: no aphorisms, no contrastive framing, no analogies, no engineered landings. Report what happened and why; let some paragraphs end without resolving.
    - Connect to the existing narrative thread
    - Voice reference: follow the first-person voice guidance in `.aidd/skills/humanize-docs/SKILL.md` (staged; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo; including its `personal-voice.md` sidecar when present), not the existing AI-drafted sections
    - Place before the `### What I actually learned` section

17. If no milestone criteria are met, only update the `_Last updated:` date.

### Phase 7: Present Proposed Updates

18. **Present all proposed updates** to the user before writing anything:
    - **New technical diary entries** - show each drafted entry in full, with its target file path
    - **New non-technical diary entries** - show each drafted entry in full, with its target file path
    - **Dev story changes** - show drafted section, or "No new sections - milestone criteria not met"
    - **Last Updated date** change for devstory.md

19. Apply the presented updates directly in the same run; the report is the review surface.

### Phase 8: Apply Updates

20. Apply the updates directly.

21. **Write diary entry files**:
    - Create `<applications-root>/devdiary/entries/YYYY/MM/DD.md` (technical) for each new entry
    - Create `<applications-root>/devdiary/entries/YYYY/MM/DDhl.md` (non-technical) for each new entry
    - Create parent directories if they don't exist (`mkdir -p`)
    - Never overwrite an existing entry file - if a file already exists for that date (either `DD.md` or `DDhl.md`), skip that entry (do not overwrite) and report the conflict in the run summary for later review

22. **Update devstory.md**:
    - Insert new narrative section(s) before the `### What I actually learned` section
    - Update the `_Last updated:` footer date to today's date

23. **Verify** all written files are well-formed markdown after edits.

## Notes

- The diary is a source-material log. Dry facts are the goal - personality and voice get added by the human when a fact sheet becomes a post. A generated entry that reads like a finished, polished story is a defect, not a bonus.
- The dev story uses a conversational but technically precise voice, subject to the style constraints above. Do not match the tone of existing AI-drafted sections; when in doubt, plainer wins.
- When scanning git logs, focus on substantive development - ignore merge commits and automated-only version bumps.
- When multiple projects are active simultaneously, look for the narrative thread that connects them (template enabling apps, tools enabling workflows).
- If there has been no meaningful development since the last update, say so clearly and do not create empty entries.
- **Both the technical diary entries AND non-technical entries AND the story must be updated** every run - at minimum the story's `_Last updated:` date should be refreshed.
- The non-technical entries (hl.md) should stand alone as readable stories without requiring the technical entries for context.
