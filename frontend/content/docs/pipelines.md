# Pipeline sessions

A **pipeline session** is the durable record of one **recipe** execution. Every recipe launch creates exactly one session, including recipes with a single step. A one-shot skill uses a synthetic single-step recipe and appears as **Skill** rather than **Pipeline** in the unified [Runs](/runs) feed. Each session has a report page for reviewing its full step history. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

## What a session records

Status and timing
: whether the session is queued, running, completed, stopped, or failed, and how long each part took. A session that completed some steps but failed others shows **completed with failures** (a partial success with a failed-step summary) rather than a bare failure.
Step progress
: pending and executed steps in recipe order, including hooks and nested recipe steps.
Run results
: steps that spawn a managed run link to that run in the Live Console; their reports also show run summaries, commands, commits and file changes, plus expandable console output when available.
Errors
: any step failures, surfaced inline.

## Working with sessions

- On [Runs](/runs), expand a multi-step pipeline row to see its steps, or open its **Report** <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> for the complete step history and output. Single-step sessions do not expand because their step would duplicate the session row.
- You can **stop** an active session from the Runs feed or the report.
- Sessions persist after they finish, so you can review what a recipe did long after it ran.

## Starting a session

Launch a recipe manually from [Recipes](/recipes), or run a **skill** as a one-shot. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> Scheduled tasks, Director suggestions, and project workflows such as intake can also start pipeline sessions. The Runs feed and session reports are for reviewing and stopping them, not starting them.
