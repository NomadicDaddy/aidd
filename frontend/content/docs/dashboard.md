# Dashboard

The Dashboard is your fleet-level status view. It summarizes what's happening
across every discovered project so you can spot what needs attention without
opening each one.

## Fleet metrics

A row of four tiles across the top:

- **Projects**: how many projects were discovered, split into healthy and
  needs-attention.
- **Active Runs**: runs currently executing, with a live status indicator. A
  filled dot means a run is actively reporting progress.
- **Priority Health**: the share of priority features passing across the fleet,
  as a percentage with a health band and the passing/total count behind it.
- **Suggestions**: pending Director actions you haven't acted on yet.

## Cards

Below the metrics:

- **Active Runs**: the runs in flight right now, each linking to its console.
- **Feature Summary**, **Feature Queue**, and **Feature Status**: how tracked
  work is distributed across backlog, in-progress, completed, and
  waiting-approval states, and what's next in the queue.
- **Project Health**: per-project rows covering feature pass rates and
  artifact freshness.
- **Director Queue**: pending suggestions the Director has produced but you
  haven't acted on yet.
- **Waiting Approval**: work items across the fleet that need your decision.

Cards can be dragged into the order you want. The lock control in the page
header freezes that layout once you're happy with it.

While a Director cycle is running, a banner tracks its progress, and a
decision queue surfaces items awaiting your input.

## Tips

- Cards link straight to the relevant page: click an active run to jump to the
  live console, or a suggestion to act on it.
- The Dashboard reflects the same data shown elsewhere; if a number looks
  stale, refresh the page from its header control.
