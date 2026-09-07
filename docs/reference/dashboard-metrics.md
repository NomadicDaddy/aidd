# Dashboard Metrics

The dashboard's "Fleet metrics" row (`frontend/src/pages/dashboard/DashboardMetrics.tsx`) shows four
headline numbers. This page is their definition of record: change the numbers here in lockstep with
the code, and do not re-derive them ad hoc.

The four metrics are rendered by the generic `<Metric>` card
(`frontend/src/components/shared/Metric.tsx`); the values are computed at the top of `DashboardPage()`
(`frontend/src/pages/dashboard/DashboardPage.tsx`) and passed to `<DashboardMetrics>` as props.

## Metrics

### Projects

- **Value:** `projectCount`, the number of discovered projects, excluding archived `*.old` projects
  (`projectList = projects.filter((p) => !p.name.endsWith('.old'))`). Falls back to
  `fleet.fleetAggregations.projectCount` when the local list is empty.
- **Detail:** `${healthyProjects} healthy / ${failingProjects.length} need attention`, with the
  need-attention half tinted red when the count is above zero. A project is in the "need attention"
  group when `project.priorityHealth.band !== 'healthy'`; `healthyProjects` is the remainder,
  `Math.max(projectCount - failingProjects.length, 0)`.
- **Terminology:** use **"need attention"**, not "failing", because a non-`healthy` band includes
  stale and other needs-attention states that are not literal failures.

### Active Runs

- **Value:** `activeRuns.length`, the runs with `status === 'running'`, from the paginated `useRuns()`
  list flattened across pages.
- **Detail:** "run in progress" / "runs in progress".

### Priority Health

Keep the headline and detail aligned to the same feature-pass ratio.

- **Value:** `featureHealthValue`, the **fleet feature-pass rate**, rendered as
  `${featureHealthValue}%`. It is `percent(fleetFeaturePassing, fleetFeatureTotal)`, summed over the
  discovered project list's `featureStats.passing` / `featureStats.total`. When that list contributes
  no features, the totals fall back to the fleet summary's per-project `completedCount` /
  `featureCount`; if that total is also zero, the value falls back to the backend aggregate
  `fleet.fleetAggregations.featurePassRate`, computed in
  `backend/src/services/director/fleetSummaryService.ts` as
  `totalFeatures === 0 ? 100 : round(completedFeatures / totalFeatures * 100)`. Note that the
  no-feature case yields 100 there, where the frontend `percent()` helper yields 0.
- **Detail:** `${fleetFeaturePassing}/${fleetFeatureTotal} passing`.
- **Footer:** `PriorityHealthFooter.tsx` fills a bar to `featureHealthValue`% and, when one is
  present, renders a band chip from `fleet.fleetAggregations.priorityHealth.band` (labelled by
  `healthBandLabel()` in `dashboard-shared.ts`). That chip is the fleet priority band, not the pass
  rate; do not restate either as the other.
- **Invariant (do not regress):** the headline is the **feature-pass ratio**. The separate
  `fleetHealthScore` (worst-project priority score, bucket ceiling minus penalty) is **diagnostic
  only**: it is written to `director_cycles.fleet_health_score` by `cyclePersistence.ts` and echoed
  in the director cycle's JSON output shape (`directCycleNormalizer.ts`), and no UI surface renders
  it. It must never be shown as the Priority Health headline beside a passing-ratio subtext. This
  invariant is encoded as `.aidd/features/recipes-dashboard/feature.json` item 27.

### Suggestions

- **Value:** `pendingSuggestions.length`, the director suggestions with `status === 'pending'`.
- **Detail:** "pending director actions".

## Where the numbers come from

| Metric          | Source field / computation                                                                                        | Computed in                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Projects        | `projectList.length` (excl. `*.old`); else `fleetAggregations.projectCount`                                       | `DashboardPage.tsx`                                    |
| Active Runs     | `runList.filter(status === 'running')`                                                                            | `DashboardPage.tsx`                                    |
| Priority Health | `percent(passing, total)` over `featureStats`; else fleet `completedCount`/`featureCount`; else `featurePassRate` | `DashboardPage.tsx`, fallback `fleetSummaryService.ts` |
| Suggestions     | `suggestions.filter(status === 'pending')`                                                                        | `DashboardPage.tsx`                                    |

`fleetHealthScore` is **diagnostic, not a dashboard headline**; see Priority Health above.
