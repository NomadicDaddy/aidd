# Dashboard

The Dashboard is your fleet-level status view. It summarizes what's happening across discovered projects so you can spot what needs attention without opening each one. Archived projects whose names end in `.old` are excluded.

## Fleet metrics

A group of four linked tiles appears across the top:

Suggestions
: pending Director actions you haven't acted on yet.
Priority Health
: the share of tracked features passing across the fleet, as a percentage with a health band and the passing/total count behind it.
Active Runs
: runs whose current status is `running`.
Projects
: how many projects were discovered, split into healthy and need-attention counts.

Each tile opens its corresponding Director, Projects, or Runs page.

## Cards

Below the metrics:

Waiting Approval
: up to six Director suggestions, `waiting_approval` features, and user-blocked runs. Suggestions are shown first and project-scoped suggestions can be approved or dismissed here. Fleet-wide suggestions must be handled on the Director page.
Director Queue
: up to four pending suggestions queued behind those already shown in Waiting Approval.
Feature Queue
: up to six of the highest-priority open features across the fleet, ordered by priority number and then project name.
Active Runs
: up to four running jobs with their source, mode, execution identity, start time, heartbeat health, and current activity. A pulsing green dot means the heartbeat is live; amber means no recent heartbeat, red means stalled, and a neutral indicator means the run is still starting.
Feature Summary
: per-application and fleet totals for audit, remediation, feature, pending, completed, and total records.
Feature Status
: up to six feature records at a time, filterable by pending/completed state and by feature, remediation, or audit category.
Project Health
: up to six projects with priority health, artifact health, milestone progress, feature pass counts, and configured frontend/backend port status.

The card layout starts locked. Unlock it from the page header to reorder cards, switch a card between half and full width, or resize its height. Lock it again when you're finished. Your order and sizes are saved in this browser.

While a Director cycle is running, a banner shows its current stage, elapsed time, start time, and a link to the Director page.

## Tips

- Use each card's header link to open the full Director, Projects, or Runs view. Feature Queue and Feature Status rows also link to the relevant project's Features tab.
- Expand the freshness readout in the page header to check the Projects, Runs, fleet-summary, Suggestions, and Director-cycle sources separately. Refresh refetches all five sources without reloading the page.
