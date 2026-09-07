import { recentActivityEntries } from 'aidd-shared/runs/activity';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import { dashboardSummaryRouteGroup } from '../../backend/src/routes/projectsDashboardSummary.ts';
import {
	buildDashboardSummary,
	DASHBOARD_PREVIEW_ROWS,
} from '../../backend/src/services/project/dashboardSummary.ts';
import {
	DASHBOARD_FIXTURE_FEATURE_RECORDS,
	DASHBOARD_FIXTURE_PROJECT_COUNT,
	makeDashboardFleet,
	makeDashboardPortStatus,
	makeDashboardProject,
} from '../_helpers/dashboard-fleet-fixture.ts';

/**
 * The budget the PERFORMANCE audit set for this endpoint. The response it replaces measured
 * 1,399,653 bytes on the fleet the fixture reproduces.
 */
const SUMMARY_BUDGET_BYTES = 262_144;

const fleet = makeDashboardFleet();
const portStatus = makeDashboardPortStatus(fleet);
const summary = buildDashboardSummary(fleet, portStatus);

describe('dashboard summary payload', () => {
	test('the fixture reproduces the fleet the audit measured', () => {
		expect(fleet).toHaveLength(DASHBOARD_FIXTURE_PROJECT_COUNT);
		expect(fleet.reduce((sum, p) => sum + p.featureStatus.length, 0)).toBe(
			DASHBOARD_FIXTURE_FEATURE_RECORDS,
		);
	});

	test('serialization stays under the page-weight budget', () => {
		const bytes = Buffer.byteLength(JSON.stringify(summary), 'utf8');
		const fullListingBytes = Buffer.byteLength(JSON.stringify({ projects: fleet }), 'utf8');

		expect(bytes).toBeLessThanOrEqual(SUMMARY_BUDGET_BYTES);
		// The projection is the point, not a smaller encoding of the same data.
		expect(bytes).toBeLessThan(fullListingBytes / 4);
	});

	test('no card gets more rows than it can render', () => {
		expect(summary.featureStatus.buckets).toHaveLength(6);
		for (const bucket of summary.featureStatus.buckets) {
			expect(bucket.rows.length).toBeLessThanOrEqual(DASHBOARD_PREVIEW_ROWS);
			expect(bucket.rows.length).toBeLessThanOrEqual(bucket.total);
		}
		expect(summary.waitingApproval.features.length).toBeLessThanOrEqual(DASHBOARD_PREVIEW_ROWS);
	});

	test('bounded previews carry unbounded counts', () => {
		const allRows = fleet.flatMap((project) => project.featureStatus);
		const bucketTotal = summary.featureStatus.buckets.reduce(
			(sum, bucket) => sum + bucket.total,
			0,
		);

		// The six buckets partition every record, which is what lets the card print "N total"
		// without holding the records.
		expect(bucketTotal).toBe(DASHBOARD_FIXTURE_FEATURE_RECORDS);
		expect(summary.waitingApproval.total).toBe(
			allRows.filter((row) => row.status === 'waiting_approval').length,
		);
		expect(summary.waitingApproval.total).toBeGreaterThan(DASHBOARD_PREVIEW_ROWS);
	});

	test('per-project entries stay bounded as the roadmap grows', () => {
		const project = summary.projects[0];

		expect(project?.milestones).toHaveLength(3);
		expect(project?.milestoneCount).toBe(5);
		expect(project?.hiddenMilestoneCount).toBe(2);
		expect(project?.artifactCounts).toEqual({ fresh: 7, missing: 1, stale: 2 });
		expect(project?.portStatus).toEqual({ backend: true, frontend: true });
	});

	test('the maturity badge is projected in full, and nothing else of the model is', () => {
		const project = summary.projects[3];
		const source = fleet[3]?.metadata.maturity;

		// The stage list is a fixed seven, so carrying all of it keeps the payload bounded and
		// lets the card draw the same ring the Projects page draws.
		expect(project?.maturity.stageStatuses).toHaveLength(7);
		expect(project?.maturity).toEqual(source as never);
		// The badge, not MaturityDto: the full model carries every artifact of every stage.
		expect(Object.keys(project?.maturity ?? {})).toEqual([
			'currentStageId',
			'currentStageLabel',
			'nextArtifactLabel',
			'nextArtifactSlug',
			'percent',
			'stageStatuses',
		]);
	});

	test('the activity preview is bounded, newest first, and counts what it omits', () => {
		const { items, total } = summary.recentActivity;

		expect(items.length).toBeLessThanOrEqual(DASHBOARD_PREVIEW_ROWS);
		expect(total).toBeGreaterThan(items.length);
		const timestamps = items.map((item) => Date.parse(item.timestamp));
		expect(timestamps).toEqual([...timestamps].sort((left, right) => right - left));
		// Each fixture project records two runs and two iterations, one of which repeats the
		// newer run. The shared derivation collapses that pair, so a project contributes three.
		expect(total).toBe(DASHBOARD_FIXTURE_PROJECT_COUNT * 3);
	});

	test('rows identify the project they came from', () => {
		const routeIds = new Set(summary.projects.map((project) => project.routeId));

		for (const item of summary.recentActivity.items) {
			expect(routeIds.has(item.projectId)).toBe(true);
			expect(item.projectName).not.toBe('');
			// Entry ids repeat across projects; the row id has to survive one list.
			expect(item.id.startsWith(`${item.projectId}:`)).toBe(true);
		}
		expect(new Set(summary.recentActivity.items.map((item) => item.id)).size).toBe(
			summary.recentActivity.items.length,
		);
	});

	test('rows say what the project page says about the same run', () => {
		const item = summary.recentActivity.items[0];
		const project = fleet.find((entry) => entry.routeId === item?.projectId);
		const expected = recentActivityEntries(
			project?.metadata.localRuns ?? [],
			project?.metadata.localIterations ?? [],
		).find((entry) => entry.runId === item?.runId);

		// Not a re-derivation with the same inputs: the projection calls the same module the
		// project-detail timeline calls, so a divergence here means one of them stopped doing so.
		expect(item?.statusLabel).toBe(expected?.statusLabel ?? '');
		expect(item?.title).toBe(expected?.title ?? '');
		expect(item?.summary).toBe(expected?.summary ?? null);
		expect(item?.traceLabel).toBe(expected?.traceLabel ?? '');
		expect(item?.executionIdentity).toEqual(expected?.executionIdentity ?? null);
	});

	test('the run and iteration ledgers never cross the wire', () => {
		const serialized = JSON.stringify(summary);

		// The whole point of the projection: the dashboard reads these to derive six rows, and
		// the rows are what it sends.
		expect(serialized).not.toContain('localRuns');
		expect(serialized).not.toContain('localIterations');
		expect(serialized).not.toContain('commitsCreated');
		expect(serialized).not.toContain('finalChecks');
	});

	test('archived .old copies stay out of the fleet rollups but keep their route', () => {
		const archived = makeDashboardProject(99, 4);
		archived.name = `${archived.name}.old`;
		const projected = buildDashboardSummary([...fleet, archived], portStatus);
		const rollupTotal = projected.featureStatus.buckets.reduce((s, b) => s + b.total, 0);

		expect(rollupTotal).toBe(DASHBOARD_FIXTURE_FEATURE_RECORDS);
		expect(projected.recentActivity.total).toBe(summary.recentActivity.total);
		expect(projected.recentActivity.items.every((i) => i.projectName !== archived.name)).toBe(
			true,
		);
		expect(projected.projects.map((p) => p.name)).toContain(archived.name);
	});
});

describe('GET /api/v1/projects/dashboard-summary', () => {
	const app = new Elysia().use(
		dashboardSummaryRouteGroup(
			{
				getPortStatus: () => Promise.resolve(portStatus),
				listProjectListings: () =>
					Promise.resolve({
						projects: fleet.map((project) => ({
							prioritySummary: null,
							summary: project,
						})),
					}),
			} as unknown as Parameters<typeof dashboardSummaryRouteGroup>[0],
			'',
		),
	);

	test('answers within the budget and passes its own response schema', async () => {
		const response = await app.handle(new Request('http://localhost/dashboard-summary'));
		const body = await response.text();

		// A schema violation surfaces as a 422 from Elysia's response validation, so a 200 here is
		// the assertion that the projection matches the declared contract.
		expect(response.status).toBe(200);
		expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(SUMMARY_BUDGET_BYTES);
		expect(JSON.parse(body)).toEqual(summary);
	});
});
