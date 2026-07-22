import { afterEach, describe, expect, test } from 'bun:test';
import {
	CARD_HEIGHT_MAX,
	CARD_HEIGHT_MIN,
	DASHBOARD_CARD_IDS,
	normalizeCardOrder,
	normalizeCardSizes,
	useDashboardStore,
} from '../../frontend/src/stores/dashboardStore.ts';

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
		expect(normalizeCardOrder([])).toEqual([...DASHBOARD_CARD_IDS]);
	});

	test('drops ids that are no longer known', () => {
		const result = normalizeCardOrder(['ghost-card', 'fleet-health']);
		expect(result).not.toContain('ghost-card');
		expect(result).toHaveLength(DASHBOARD_CARD_IDS.length);
	});

	test('re-inserts missing ids at their default position', () => {
		const withoutFeatureStatus = DASHBOARD_CARD_IDS.filter((id) => id !== 'feature-status');
		const result = normalizeCardOrder(withoutFeatureStatus);
		expect(result).toEqual([...DASHBOARD_CARD_IDS]);
		expect(result.indexOf('feature-status')).toBe(4);
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
		expect(normalizeCardSizes({ 'fleet-health': 'garbage' })).toEqual({});
	});

	test('drops unknown ids and invalid values, keeps valid entries', () => {
		const result = normalizeCardSizes({
			'active-runs': { width: 'sideways' },
			'fleet-health': { height: 400, width: 'full' },
			'ghost-card': { height: 300 },
		});
		expect(result).toEqual({ 'fleet-health': { height: 400, width: 'full' } });
	});

	test('clamps heights into the allowed range', () => {
		const result = normalizeCardSizes({
			'active-runs': { height: 10_000 },
			'fleet-health': { height: 5 },
		});
		expect(result['fleet-health']?.height).toBe(CARD_HEIGHT_MIN);
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
		useDashboardStore.getState().setCardWidth('fleet-health', 'full');
		useDashboardStore.getState().setCardHeight('fleet-health', 60);
		expect(useDashboardStore.getState().cardSizes['fleet-health']).toEqual({
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
		expect(order[0]).toBe('waiting-approval');
		expect(order).toContain('feature-status');
		expect(order).toHaveLength(DASHBOARD_CARD_IDS.length);
	});
});
