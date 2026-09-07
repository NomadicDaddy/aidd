import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { projectsReading } from '../../frontend/src/pages/dashboard/projectsReading.ts';

const DASHBOARD_SRC = resolve(import.meta.dir, '../../frontend/src/pages/dashboard');

async function dashboardSource(file: string): Promise<string> {
	return await Bun.file(resolve(DASHBOARD_SRC, file)).text();
}

const HEALTHY = [{ priorityBand: 'healthy' }, { priorityBand: 'healthy' }];
const MIXED = [
	{ priorityBand: 'healthy' },
	{ priorityBand: 'at-risk' },
	{ priorityBand: 'failing' },
];

// The defect: when the dashboard summary request failed, the projects list was empty, so the tile
// substituted the fleet aggregate for the count and computed its split from the empty list. It read
// "N projects — 0 need attention" on a dashboard that had failed to load, which is a stronger claim
// than the healthy case and was made from no data at all.
describe('the Overview Projects tile says nothing rather than something false', () => {
	test('a failed summary produces no reading, whatever the fleet count says', () => {
		expect(projectsReading([], 42, true)).toBeNull();
		// The fleet count is not a fallback here even though it is a real number: the tile's claim
		// is a count plus a split, and the split has no source when the summary did not arrive.
		expect(projectsReading(MIXED, 42, true)).toBeNull();
	});

	test('an empty list with a healthy summary still counts, but claims no split', () => {
		// The two are different states. A deployment whose project list has not arrived yet has a
		// fleet count worth showing; what it does not have is a healthy/failing breakdown.
		expect(projectsReading([], 42, false)).toEqual({ count: 42, split: null });
		expect(projectsReading([], 0, false)).toEqual({ count: 0, split: null });
	});

	test('a loaded list is counted from itself, and every project lands on one side', () => {
		expect(projectsReading(HEALTHY, 99, false)).toEqual({
			count: 2,
			split: { failing: 0, healthy: 2 },
		});
		const mixed = projectsReading(MIXED, 99, false);
		expect(mixed).not.toBeNull();
		expect(mixed?.count).toBe(3);
		// Stated as a partition rather than as two independent numbers: a band added to
		// DirectorHealthBand must fall on one side, and neither side may double-count it.
		expect((mixed?.split?.failing ?? 0) + (mixed?.split?.healthy ?? 0)).toBe(3);
		expect(mixed?.split).toEqual({ failing: 2, healthy: 1 });
		// The fleet count is ignored once the list is present, so the two can never disagree.
		expect(mixed?.count).not.toBe(99);
	});

	test('the tile renders the failure, and does not link out of it', async () => {
		const metrics = await dashboardSource('DashboardMetrics.tsx');
		expect(metrics).toContain("message: 'Failed to load projects.'");
		expect(metrics).toContain('onRetry: onRetryProjects');
		// A tile that cannot say how many projects there are is not a link to the projects list,
		// and is not interactive-looking either.
		expect(metrics).toContain('interactive={projectsReading !== null}');
		expect(metrics).toContain('{projectsReading !== null ? (');

		// The page passes a reading, not three separately-derived numbers, so there is no longer a
		// path by which the count comes from one source and the split from another.
		const page = await dashboardSource('DashboardPage.tsx');
		expect(page).toContain('projectsReading(projectList, fleetProjectCount, summary.isError)');
		expect(page).not.toContain('const healthyProjects =');
		expect(page).not.toContain('const failingProjects =');
	});

	test('the shared Metric renders an error state instead of a stale reading', async () => {
		const metric = await Bun.file(
			resolve(DASHBOARD_SRC, '../../components/shared/Metric.tsx'),
		).text();
		expect(metric).toContain('error?: { message: string; onRetry: () => void } | undefined;');
		// The tone reads the value, so a value that is not there must not colour the tile.
		expect(metric).toContain("const reading = error ? 'neutral' : readingTone(tone, value);");
		// The detail line describes the value; with no value there is nothing for it to describe.
		expect(metric).toContain('{error ? null : loading ? (');
	});
});
