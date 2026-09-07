# Audits

An **audit** is a definition describing a class of review, for example `SECURITY`, `DEAD_CODE`, or `TECHDEBT`. Running one produces **findings** and a dated audit report. Audit definitions live in the aidd installation's `audits/` catalog; project reports and findings live under the target project's `.aidd/` directory.

## Tabs

Catalog
: the available definitions, the global audits enabled state, change-potential and outcome metrics, project applicability, and aggregate fresh, stale, and missing report counts. Select a definition to review or edit its source.
Applicability
: the global audit-policy matrix across the seven assurance buckets. Conditional cells have additional profile constraints; the global mapping can be edited here.
Project Overrides
: per-project audit effects and rules layered above the global mapping.

## How findings become work

When an audit runs in audit mode, each confirmed issue accepted from its structured result becomes a **finding**: a tracked feature with an `audit-` id prefix, an `auditSource`, and an `auditSeverity`. The run also records the finding lifecycle in `.aidd/findings-ledger.jsonl`. Duplicate findings and previously dismissed false positives are recorded in that ledger but do not create another feature.

Normal coding selection excludes audit findings. Act on them by explicitly selecting a finding or by launching an audit-findings remediation sweep.

## Applicability

Not every audit applies to every project. A project's **assurance profile** (criticality, data sensitivity, deployment, and other facets), the global mapping, and its project overrides determine which audits are relevant. Edit the profile from the project's **Profile** tab; use **Project Overrides** here for project-specific audit policy.

## Launching

Choose one or more projects in **Launch targets**, then select enabled definitions:

- **Run Selected** explicitly reruns the selected definitions, including those with fresh reports.
- **Run All** runs the project's applicable definitions whose reports are missing or stale, ordered by change potential.
- **Review Selected** checks existing findings from the selected definitions against current code. It can annotate stale or resolved finding notes, but it does not run a fresh audit or remediate the findings.

The Run and Review launch-target controls can override the engine, model, and reasoning effort for that launch. The global **Audits Enabled** control gates every launch. Use **Schedule audit** to set up recurring or future audit runs.

Each selected project gets its own run. Audit runs and directive-mode reviews appear in [Runs](/runs). <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
