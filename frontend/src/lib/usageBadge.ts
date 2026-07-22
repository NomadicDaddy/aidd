import type { ResourceUsageRow } from '../api/types.ts';

import { formatRelativeAge } from './formatters.ts';

export function formatUsageBadge(usage: ResourceUsageRow | undefined): null | string {
	if (!usage || usage.total === 0) return null;
	const runs = `${usage.total} ${usage.total === 1 ? 'run' : 'runs'}`;
	if (usage.lastUsedAt === null) return runs;
	return `${runs} · last ${formatRelativeAge(new Date(usage.lastUsedAt).toISOString())}`;
}
