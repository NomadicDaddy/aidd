# Pipeline sessions

A **pipeline session** is one execution of a **recipe**: a file-backed,
multi-step template. Every recipe launch creates exactly one session, even for
single-step recipes. This page reviews those sessions.

## What a session records

- **Status and timing**: whether the session is queued, running, completed,
  stopped, or failed, and how long each part took. A session that completed
  some steps but failed others shows **completed with failures** (a partial
  success with a failed-step summary) rather than a bare failure.
- **Step progress**: per-step results in execution order.
- **Run links**: steps that spawn a run link to that run's detail.
- **Errors**: any step failures, surfaced inline.

## Working with sessions

- Click a session to open its report, which shows step-by-step progress and
  output summaries.
- You can **stop** an active session from either the list or the report.
- Sessions persist after they finish, so you can review what a recipe did long
  after it ran.

## Starting a session

Sessions are launched from **Recipes** (or by running an **Skill** as a
one-shot). This page is for reviewing and stopping them, not starting them.
