# Telemetry

Telemetry summarizes the control panel's local invocation ledger for **skills**, **recipes**, and **runs**, plus output metrics recorded for runs. It also inventories the separate system, browser-health, and AI-call diagnostics that aidd keeps locally.

## Filters

Two segmented controls at the top scope the invocation summary, leaderboard, invocation chart, CLI mix, and recent-invocation list:

Resource type
: show all resources, or focus on skills, recipes, or runs.
Time window
: show the last 24 hours, 7 days, 30 days, or all recorded history. The default is 7 days.

The 24-hour window uses hourly chart buckets; every other window uses daily buckets. **Agent output** is always run-only: the time filter applies, but the chart is unavailable while Skills or Recipes is selected.

## What you'll see

Invocation summary
: totals for the window, split by top-level versus nested invocations and by outcome in the same order as the tiles — Completed, Warnings, Failed, Flagged, Stopped, Killed, No work, and Running. Select an outcome tile to filter and scroll to the recent-invocation list. Failed means the run itself ended in error; Flagged is a provider content-policy refusal. Stopped is a graceful operator request, while Killed is a forced end.
Most used
: the ten resources invoked most in the window.
Invocations over time
: invocation counts per bucket.
CLI mix
: which execution CLIs the invocations recorded.
Agent output
: lines added, removed, and files changed by attributed run commits, or input, output, cached, and reasoning tokens, per bucket. Coverage counts distinguish zero output from runs whose metrics were not captured.
Recent invocations
: the latest 50 invocations in the window, each expandable for its stored identity, source, project path, timing, hierarchy, run or session links, status, exit code, and error detail.

A **What aidd records** panel sits above the charts. Expand it for exactly what is collected under **Invocations**, **Run output**, **System and browser health**, and **AI call diagnostics**. All of it stays in this local installation; aidd does not send usage data to its maintainers or to any third-party tracking service.

## Reading the data

Invocation counts and charts come from the local invocation ledger. Every recorded top-level launch and every nested recipe or skill step is one invocation. For an invocation linked to a run, the run record is authoritative for its outcome and terminal details; Agent output reads terminal run records directly. On startup, aidd reconciles stale run-backed invocations from their run records and marks non-resumable unlinked invocations as failed.

## Tips

- Low-usage skills or recipes are candidates for consolidation or removal.
- Pair a time-window filter with the resource filter to answer questions like "what did we run most this week?"
- A rising flagged or warning count in the summary is usually worth chasing before a rising invocation count.
