# Telemetry

Telemetry aggregates local usage, outcome, output, and health data across your
**skills**, **recipes**, and **runs** so you can see what's actually being used
over time.

## Filters

Two segmented controls at the top scope everything below them:

- **Resource type**: focus on skills, recipes, or runs.
- **Time window**: narrow to a recent period or widen to see long-term trends.

The window also sets the bucket used by the charts — per hour for short
windows, per day for long ones.

## What you'll see

- **Invocation summary**: totals for the window, split by top-level versus
  nested invocations and by outcome — running, stopped, killed, flagged,
  warnings, and no-work.
- **Most used**: a leaderboard of the resources invoked most in the window.
- **Invocations over time**: invocation counts per bucket.
- **Backend mix**: which engines the invocations ran on.
- **Agent output**: lines added and removed by run commits, or tokens consumed
  and produced, per bucket. This one applies to runs; with a skills-only or
  recipes-only filter it tells you so and offers to clear the filter.
- **Recent invocations**: the latest invocations in the window, each expandable
  for its detail.

A **What aidd records** panel sits above the charts. Expand it for exactly what
is collected under **Invocations**, **Run output**, **System and browser
health**, and **AI call diagnostics**. All of it stays in this local
installation; aidd does not send usage data to its maintainers or to any
third-party tracking service.

## Reading the data

Telemetry is derived from your run history; runs are the source of truth. Each
terminal run reconciles into the usage records, so the numbers here track what
the control panel recorded, not a separate parallel tally.

## Tips

- Low-usage skills or recipes are candidates for consolidation or removal.
- Pair a time-window filter with the resource filter to answer questions like
  "what did we run most this week?"
- A rising flagged or warning count in the summary is usually worth chasing
  before a rising invocation count.
