# Audits

An **audit** is a definition describing a class of review, for example
`SECURITY`, `DEAD_CODE`, or `TECHDEBT`. Running one produces **findings** and a
dated audit report.

## What this page manages

- **Audit definitions**: the catalog of available reviews.
- **Global enablement**: which audits are turned on across the fleet.
- **Profile applicability**: which audits apply to a project based on its
  assurance profile.
- **Report health**: whether each project's audit reports exist and are fresh.

## How findings become work

When an audit runs in audit mode, each issue it surfaces is recorded as a
**finding**: a tracked feature with an `audit-` id prefix plus its source and
severity. Findings are skipped by normal coding selection, so they don't get
picked up accidentally; you decide when to act on them.

## Applicability

Not every audit applies to every project. A project's **profile** (criticality,
data sensitivity, deployment, and more) determines which audits are relevant.
Edit a project's profile from its detail view to change what applies.

## Launching

You can launch an audit (or a review) for a project directly from this page.
The resulting run behaves like any other run and shows up in [Runs](/runs). <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
