import type { DirectorBacklogItemSummary } from './types.ts';

export function normalizeSeverity(value: unknown): string {
	const lower = typeof value === 'string' ? value.toLowerCase() : '';
	if (lower === 'critical') return 'critical';
	if (lower === 'high') return 'high';
	if (lower === 'low') return 'low';
	if (lower === 'info') return 'info';
	return 'medium';
}

export function numericPriority(value: unknown): number {
	return numericPriorityOrNull(value) ?? 999;
}

export function numericPriorityOrNull(value: unknown): null | number {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

export function topPriority(items: DirectorBacklogItemSummary[]): number {
	return Math.min(...items.map((item) => item.priority ?? 999), 999);
}

export function sourcePriority(evidence: Record<string, unknown>): number {
	const value = evidence.sourcePriority;
	return typeof value === 'number' ? value : 999;
}

export function sourceCount(evidence: Record<string, unknown>): number {
	const value = evidence.count;
	return typeof value === 'number' ? value : 0;
}
