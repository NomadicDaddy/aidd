# Pipeline sessions

A **pipeline session** is one execution of a **recipe**: a file-backed,
multi-step template. Every recipe launch creates exactly one session, even for
single-step recipes. Sessions appear in the unified [Runs](/runs) feed, and each has <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
a report page reviewing its full step history.

## What a session records

- **Status and timing**: whether the session is queued, running, completed,
  stopped, or failed, and how long each part took. A session that completed
  some steps but failed others shows **completed with failures** (a partial
  success with a failed-step summary) rather than a bare failure.
- **Step progress**: per-step results in execution order.
- **Run links**: steps that spawn a run link to that run's detail.
- **Errors**: any step failures, surfaced inline.

## Working with sessions

- On [Runs](/runs), expand a pipeline row to see its steps, or open its **Report** <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
  for step-by-step progress and output summaries.
- You can **stop** an active session from the Runs feed or the report.
- Sessions persist after they finish, so you can review what a recipe did long
  after it ran.

## Starting a session

Sessions are launched from [Recipes](/recipes) (or by running a **skill** as a <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
one-shot). The Runs feed and this report are for reviewing and stopping them,
not starting them.
