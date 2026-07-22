# Dashboard

The Dashboard is your fleet-level status view. It summarizes what's happening
across every discovered project so you can spot what needs attention without
opening each one.

## What you'll see

- **Fleet Health**: how many projects were discovered and their overall
  health.
- **Active Runs**: runs currently executing, with a live status indicator. A
  filled dot means a run is actively reporting progress.
- **Feature Summary**, **Feature Queue**, and **Feature Status**: how tracked
  work is distributed across backlog, in-progress, completed, and
  waiting-approval states, and what's next in the queue.
- **Project Health**: per-project rows covering feature pass rates and
  artifact freshness.
- **Director Queue**: pending suggestions the Director has produced but you
  haven't acted on yet.
- **Waiting Approval**: work items across the fleet that need your decision.

While a Director cycle is running, a banner tracks its progress, and a
decision queue surfaces items awaiting your input.

## Tips

- Cards link straight to the relevant page: click an active run to jump to the
  live console, or a suggestion to act on it.
- The Dashboard reflects the same data shown elsewhere; if a number looks
  stale, refresh the page from its header control.
