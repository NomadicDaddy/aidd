import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	CARD_HEIGHT_MAX,
	CARD_HEIGHT_MIN,
	DASHBOARD_CARD_IDS,
	normalizeCardOrder,
	normalizeCardSizes,
	useDashboardStore,
} from '../../frontend/src/stores/dashboardStore.ts';

const dashboardSourceRoot = join(import.meta.dir, '../../frontend/src/pages/dashboard');

function readDashboardSource(file: string): Promise<string> {
	return Bun.file(join(dashboardSourceRoot, file)).text();
}

describe('dashboard project summary contract', () => {
	test('does not fan out project-detail queries after loading project summaries', async () => {
		const source = await readDashboardSource('DashboardPage.tsx');
		expect(source).not.toContain('useQueries');
		expect(source).not.toContain('getProject');
		expect(source).not.toContain('featureStatusDetails');
		expect(source).toContain('projects={projectList}');
	});

	test('feature cards consume only the server-projected preview', async () => {
		const [featureStatusCard, waitingApprovalCard, waitingApprovalRows] = await Promise.all([
			readDashboardSource('FeatureStatusCard.tsx'),
			readDashboardSource('WaitingApprovalCard.tsx'),
			readDashboardSource('WaitingApprovalRows.tsx'),
		]);
		// The projection moved to the server. These cards take bounded previews and their true
		// totals; flattening every project's feature records in the browser is what made the page
		// download all 2,698 of them to paint six rows.
		expect(featureStatusCard).toContain('buckets: DashboardFeatureStatusBucket[]');
		expect(featureStatusCard).not.toContain('project.featureStatus');
		expect(featureStatusCard).not.toContain('ProjectDetail');
		expect(waitingApprovalCard).toContain('features: DashboardWaitingFeature[]');
		expect(waitingApprovalCard).not.toContain('project.featureStatus');
		expect(waitingApprovalRows).toContain('feature: FeatureStatusEntry');
	});
});

function installWindow(): void {
	const storage = new Map<string, string>();
	const localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		removeItem: (key: string) => {
			storage.delete(key);
		},
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
	};
	(globalThis as unknown as { localStorage: unknown }).localStorage = localStorage;
	(globalThis as unknown as { window: unknown }).window = {
		localStorage,
		location: new URL('http://localhost/'),
	};
}

afterEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
	delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
	useDashboardStore.setState({ cardOrder: [...DASHBOARD_CARD_IDS], cardSizes: {}, locked: true });
});

describe('normalizeCardOrder', () => {
	test('returns the full default order for empty input', () => {
		expect(normalizeCardOrder([])).toEqual([
			'waiting-approval',
			'director-queue',
			'feature-queue',
			'active-runs',
			'feature-summary',
			'feature-status',
			'fleet-maturity',
			'recent-activity',
			'project-health',
		]);
	});

	test('normalizes an uncustomised stored order while preserving genuine custom orders', () => {
		const uncustomisedOrder = [
			'active-runs',
			'feature-summary',
			'feature-queue',
			'feature-status',
			'project-health',
			'director-queue',
			'waiting-approval',
		] as const;
		expect(normalizeCardOrder(uncustomisedOrder)).toEqual([...DASHBOARD_CARD_IDS]);

		const reversed = [...uncustomisedOrder].reverse();
		const normalized = normalizeCardOrder(reversed);

		// A genuine custom order stays operator-owned. Cards added in a later version join it --
		// otherwise they would be invisible to everyone who ever dragged a card -- but the order
		// the operator chose for the cards they had is returned untouched.
		expect(normalized.filter((id) => (reversed as readonly string[]).includes(id))).toEqual(
			reversed,
		);
		expect(normalized).toHaveLength(DASHBOARD_CARD_IDS.length);
	});

	test('drops ids that are no longer known', () => {
		// `fleet-health` is an id a persisted order can still hold, not an invented one: its content
		// lives in the Priority Health metric tile, not in a card of its own.
		const result = normalizeCardOrder(['ghost-card', 'fleet-health']);
		expect(result).not.toContain('ghost-card');
		expect(result).not.toContain('fleet-health');
		expect(result[0]).toBe('waiting-approval');
		expect(result).toHaveLength(DASHBOARD_CARD_IDS.length);
	});

	test('re-inserts missing ids at their default position', () => {
		const withoutFeatureStatus = DASHBOARD_CARD_IDS.filter((id) => id !== 'feature-status');
		const result = normalizeCardOrder(withoutFeatureStatus);
		expect(result).toEqual([...DASHBOARD_CARD_IDS]);
		expect(result.indexOf('feature-status')).toBe(5);
	});

	test('preserves a full custom permutation', () => {
		const reversed = [...DASHBOARD_CARD_IDS].reverse();
		expect(normalizeCardOrder(reversed)).toEqual(reversed);
	});

	test('dedupes repeated ids', () => {
		const result = normalizeCardOrder(['active-runs', 'active-runs', 'fleet-health']);
		expect(result.filter((id) => id === 'active-runs')).toHaveLength(1);
		expect(result).toHaveLength(DASHBOARD_CARD_IDS.length);
	});
});

describe('normalizeCardSizes', () => {
	test('returns empty sizes for missing or malformed input', () => {
		expect(normalizeCardSizes(undefined)).toEqual({});
		expect(normalizeCardSizes('garbage')).toEqual({});
		expect(normalizeCardSizes({ 'project-health': 'garbage' })).toEqual({});
	});

	test('drops unknown ids and invalid values, keeps valid entries', () => {
		const result = normalizeCardSizes({
			'active-runs': { width: 'sideways' },
			'ghost-card': { height: 300 },
			'project-health': { height: 400, width: 'full' },
		});
		expect(result).toEqual({ 'project-health': { height: 400, width: 'full' } });
	});

	test('clamps heights into the allowed range', () => {
		const result = normalizeCardSizes({
			'active-runs': { height: 10_000 },
			'project-health': { height: 5 },
		});
		expect(result['project-health']?.height).toBe(CARD_HEIGHT_MIN);
		expect(result['active-runs']?.height).toBe(CARD_HEIGHT_MAX);
	});
});

describe('useDashboardStore', () => {
	test('defaults to locked with the default card order', () => {
		installWindow();
		expect(useDashboardStore.getState().locked).toBe(true);
		expect(useDashboardStore.getState().cardOrder).toEqual([...DASHBOARD_CARD_IDS]);
	});

	test('toggleLocked flips the lock state', () => {
		installWindow();
		useDashboardStore.getState().toggleLocked();
		expect(useDashboardStore.getState().locked).toBe(false);
		useDashboardStore.getState().toggleLocked();
		expect(useDashboardStore.getState().locked).toBe(true);
	});

	test('setCardWidth and setCardHeight update sizes; clearing height removes empty entries', () => {
		installWindow();
		useDashboardStore.getState().setCardWidth('project-health', 'full');
		useDashboardStore.getState().setCardHeight('project-health', 60);
		expect(useDashboardStore.getState().cardSizes['project-health']).toEqual({
			height: CARD_HEIGHT_MIN,
			width: 'full',
		});
		useDashboardStore.getState().setCardHeight('active-runs', 480);
		useDashboardStore.getState().setCardHeight('active-runs', null);
		expect(useDashboardStore.getState().cardSizes['active-runs']).toBeUndefined();
	});

	test('setCardOrder stores a normalized order', () => {
		installWindow();
		const reversedWithStale = [...DASHBOARD_CARD_IDS]
			.reverse()
			.map((id) => (id === 'feature-status' ? 'stale-id' : id));
		useDashboardStore.getState().setCardOrder(reversedWithStale);
		const order = useDashboardStore.getState().cardOrder;
		expect(order).not.toContain('stale-id');
		expect(order[0]).toBe('project-health');
		expect(order).toContain('feature-status');
		expect(order).toHaveLength(DASHBOARD_CARD_IDS.length);
	});
});
