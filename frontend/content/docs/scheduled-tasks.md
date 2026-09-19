# Scheduled tasks

Use **Scheduled** to run a recipe, skill, audit, or free-form directive once or on a recurring local cadence.

## Choose a project scope

All projects
: runs once for every project discovered when the occurrence starts.
Selected projects
: runs once for each project you pick.
No project
: runs exactly once from the applications root, which is what fleet-wide work such as the development diary needs.

With no launch override, project-scoped work resolves the configured defaults for each destination.

## Choose what runs

Skill, Recipe, and Audit name an entry from the matching catalog. **Directive** names nothing: you type the instruction, and each occurrence launches it as a single-iteration directive run against every project in scope — the same run the Directive button starts, on a cadence. Directive text is stored in run history and process arguments, so keep secrets out of it.

- Audits, directives, and metadata-only recipes need a project, so they cannot be saved with **No project**.

## Set cadence and permissions

- Choose Once, Daily, selected weekdays, or an advanced five-field cron expression.
- Preview the next five times before saving.
- Skills, audits, and directives default to review-only. Recipes always allow changes; any mutating target requires explicit unattended-change confirmation.
- Use **Run now** for an operator-started occurrence without changing the saved cadence or task state. It is refused while that task already has an active occurrence.

## Review occurrences

Every occurrence keeps its due time, trigger, project scope, project snapshot, errors, outcome, and child links. A no-project occurrence reads as having run once with no project, which is not the same as an all-projects occurrence that found nothing to run. Missed times after a restart are combined into one catch-up; overlapping timer-started occurrences are recorded as skipped. Failed dispatches are not retried automatically.

## Pause, resume, or archive

Pause
: prevent future automatic occurrences without stopping an active occurrence or removing history.
Resume
: schedule the next future occurrence without replaying the time missed while paused.
Completed
: a Once task moves here after its single occurrence has run; it remains available for review but will not run again automatically. **Run now** remains available, or edit it to schedule a future time.
Archived
: retain a task and its history while preventing future occurrences, regardless of cadence.

An active occurrence must finish before its task can be archived.

## Manage automatic Director cycles

One task is built in: the Director's fleet cycle. It carries a **System** badge and runs with no project. You can rename it and change its timezone and cadence; you cannot point it somewhere else, create another one, or archive it, so pause it when you want automatic cycles to stop. Each occurrence links to the cycle it started, and an occurrence that arrives while a cycle is still running is recorded as skipped. **Run now** remains operator-started; only automatically started cycles can use Director suggestion auto-launch when that separate setting is enabled.
