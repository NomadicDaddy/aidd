import type { ResourceUsageRow } from '../api/types.ts';

import { formatRelativeAge } from './formatters.ts';

export function formatUsageBadge(usage: ResourceUsageRow | undefined): null | string {
	if (!usage || usage.total === 0) return null;
	const runs = `${usage.total} ${usage.total === 1 ? 'run' : 'runs'}`;
	if (usage.lastUsedAt === null) return runs;
	return `${runs} · last ${formatRelativeAge(new Date(usage.lastUsedAt).toISOString())}`;
}

/**
 * The same fact trimmed to one line for a dense table cell ("23 runs · 2d"). The narrow Usage
 * column wrapped the full string onto three lines, which is most of why a table row was twice the
 * height of a card row; call sites carry the full text in a `title`.
 */
export function formatUsageBadgeCompact(usage: ResourceUsageRow | undefined): null | string {
	if (!usage || usage.total === 0) return null;
	const runs = `${usage.total} ${usage.total === 1 ? 'run' : 'runs'}`;
	if (usage.lastUsedAt === null) return runs;
	const age = formatRelativeAge(new Date(usage.lastUsedAt).toISOString()).replace(/ ago$/, '');
	return `${runs} · ${age}`;
}
