import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';

export const DASHBOARD_CARD_IDS = [
	'fleet-health',
	'active-runs',
	'feature-summary',
	'feature-queue',
	'feature-status',
	'project-health',
	'director-queue',
	'waiting-approval',
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

export type DashboardCardWidth = 'full' | 'half';

export interface DashboardCardSize {
	height?: number;
	width?: DashboardCardWidth;
}

export type DashboardCardSizes = Partial<Record<DashboardCardId, DashboardCardSize>>;

export const CARD_HEIGHT_MAX = 1600;
export const CARD_HEIGHT_MIN = 120;

export function clampCardHeight(height: number): number {
	return Math.min(Math.max(Math.round(height), CARD_HEIGHT_MIN), CARD_HEIGHT_MAX);
}

/** Self-healing size normalization: drops unknown ids and malformed entries, clamps heights. */
export function normalizeCardSizes(stored: unknown): DashboardCardSizes {
	if (!stored || typeof stored !== 'object') return {};
	const result: DashboardCardSizes = {};
	for (const [id, value] of Object.entries(stored)) {
		if (!(DASHBOARD_CARD_IDS as readonly string[]).includes(id)) continue;
		if (!value || typeof value !== 'object') continue;
		const { height, width } = value as { height?: unknown; width?: unknown };
		const size: DashboardCardSize = {};
		if (typeof height === 'number' && Number.isFinite(height)) {
			size.height = clampCardHeight(height);
		}
		if (width === 'full' || width === 'half') size.width = width;
		if (size.height !== undefined || size.width !== undefined) {
			result[id as DashboardCardId] = size;
		}
	}
	return result;
}

/**
 * Self-healing order normalization: drops ids that no longer exist, dedupes,
 * and inserts ids missing from storage (e.g. cards added in a later version)
 * at their default position.
 */
export function normalizeCardOrder(stored: readonly string[]): DashboardCardId[] {
	const known = stored.filter((id): id is DashboardCardId =>
		(DASHBOARD_CARD_IDS as readonly string[]).includes(id),
	);
	const result = [...new Set(known)];
	for (const [index, id] of DASHBOARD_CARD_IDS.entries()) {
		if (!result.includes(id)) result.splice(Math.min(index, result.length), 0, id);
	}
	return result;
}

interface DashboardState {
	cardOrder: DashboardCardId[];
	cardSizes: DashboardCardSizes;
	locked: boolean;
	setCardHeight: (id: DashboardCardId, height: null | number) => void;
	setCardOrder: (order: readonly string[]) => void;
	setCardWidth: (id: DashboardCardId, width: DashboardCardWidth) => void;
	toggleLocked: () => void;
}

function updateCardSize(
	sizes: DashboardCardSizes,
	id: DashboardCardId,
	patch: (size: DashboardCardSize) => DashboardCardSize,
): DashboardCardSizes {
	const next = { ...sizes };
	const size = patch({ ...next[id] });
	if (size.height === undefined && size.width === undefined) delete next[id];
	else next[id] = size;
	return next;
}

export const useDashboardStore = create<DashboardState>()(
	persist(
		(set, get) => ({
			cardOrder: [...DASHBOARD_CARD_IDS],
			cardSizes: {},
			locked: true,
			setCardHeight: (id, height) => {
				const before = get().cardSizes;
				const cardSizes = updateCardSize(before, id, (size) => {
					if (height === null) delete size.height;
					else size.height = clampCardHeight(height);
					return size;
				});
				set({ cardSizes });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setCardHeight',
					source: 'dashboardStore',
					summary: {
						after: summarizeValue(cardSizes[id]),
						before: summarizeValue(before[id]),
						changedKeys: ['cardSizes'],
					},
				});
			},
			setCardOrder: (order) => {
				const before = get().cardOrder;
				const cardOrder = normalizeCardOrder(order);
				set({ cardOrder });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setCardOrder',
					source: 'dashboardStore',
					summary: {
						after: summarizeValue(cardOrder),
						before: summarizeValue(before),
						changedKeys: ['cardOrder'],
					},
				});
			},
			setCardWidth: (id, width) => {
				const before = get().cardSizes;
				const cardSizes = updateCardSize(before, id, (size) => ({ ...size, width }));
				set({ cardSizes });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setCardWidth',
					source: 'dashboardStore',
					summary: {
						after: summarizeValue(cardSizes[id]),
						before: summarizeValue(before[id]),
						changedKeys: ['cardSizes'],
					},
				});
			},
			toggleLocked: () => {
				const before = get().locked;
				const locked = !before;
				set({ locked });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'toggleLocked',
					source: 'dashboardStore',
					summary: {
						after: summarizeValue(locked),
						before: summarizeValue(before),
						changedKeys: ['locked'],
					},
				});
			},
		}),
		{
			merge: (persisted, current) => {
				const stored = persisted as
					Partial<Pick<DashboardState, 'cardOrder' | 'cardSizes' | 'locked'>> | undefined;
				return {
					...current,
					cardOrder: normalizeCardOrder(stored?.cardOrder ?? []),
					cardSizes: normalizeCardSizes(stored?.cardSizes),
					locked: stored?.locked ?? true,
				};
			},
			name: 'aidd-dashboard',
		},
	),
);
