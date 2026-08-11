# Dashboard Metrics

The dashboard's "Fleet metrics" row (`frontend/src/pages/dashboard/DashboardPage.tsx`) shows four
headline numbers. This page is their definition of record: change the numbers here in lockstep with
the code, and do not re-derive them ad hoc.

The four metrics are rendered by the generic `<Metric>` card
(`frontend/src/components/shared/Metric.tsx`); the values are computed at the top of `DashboardPage()`.

## Metrics

### Projects

- **Value:** `projectCount`, the number of discovered projects, excluding archived `*.old` projects
  (`projectList = projects.filter((p) => !p.name.endsWith('.old'))`). Falls back to
  `fleet.fleetAggregations.projectCount` when the local list is empty.
- **Detail:** `${healthyProjects} healthy / ${failingProjects.length} Need Attention`. A project is in
  the "Need Attention" group when `project.priorityHealth.band !== 'healthy'`; `healthyProjects` is the
  remainder.
- **Terminology:** use **"Need Attention"**, not "failing", because a non-`healthy` band includes
  stale and other needs-attention states that are not literal failures.

### Active Runs

- **Value:** `activeRuns.length`, the runs with `status === 'running'`, from the `useRuns()` list.
- **Detail:** "run in progress" / "runs in progress".

### Priority Health

Keep the headline and detail aligned to the same feature-pass ratio.

- **Value:** `featureHealthValue`, the **fleet feature-pass rate** as a percentage:
  `percent(fleetFeaturePassing, fleetFeatureTotal)`, summed over the discovered project list's
  `featureStats.passing` / `featureStats.total`. When the local project list is empty it falls back to
  the backend aggregate `fleet.fleetAggregations.featurePassRate`, computed identically in
  `backend/src/services/director/fleetSummaryService.ts`
  (`featurePassRate = round(completedFeatures / totalFeatures * 100)`).
- **Detail:** `${fleetFeaturePassing}/${fleetFeatureTotal} passing`.
- **Invariant (do not regress):** the headline is the **feature-pass ratio**. The separate
  `fleetHealthScore` (worst-project priority score, bucket ceiling minus penalty) is **diagnostic
  only**: it is persisted via `cycleService` and consumed by director suggestions, and must never
  be shown as the Priority Health headline beside a passing-ratio subtext. This invariant is encoded as
  `.aidd/features/recipes-dashboard/feature.json` item 27.

### Suggestions

- **Value:** `pendingSuggestions.length`, the director suggestions with `status === 'pending'`.
- **Detail:** "pending director actions".

## Where the numbers come from

| Metric          | Source field / computation                                            | Computed in                                            |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Projects        | `projectList.length` (excl. `*.old`)                                  | `DashboardPage.tsx`                                    |
| Active Runs     | `runList.filter(status === 'running')`                                | `DashboardPage.tsx`                                    |
| Priority Health | `percent(passing, total)` over `featureStats`; else `featurePassRate` | `DashboardPage.tsx`, fallback `fleetSummaryService.ts` |
| Suggestions     | `suggestions.filter(status === 'pending')`                            | `DashboardPage.tsx`                                    |

`fleetHealthScore` is **diagnostic, not a dashboard headline**; see Priority Health above.
