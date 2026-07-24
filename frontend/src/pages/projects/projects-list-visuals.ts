import type { ProjectMilestoneSummary, ProjectSummary } from '../../api/types.ts';
import type { BadgeTone } from './projects-list-shared.ts';

export function daysSince(iso: null | string): null | number {
	if (!iso) return null;
	const parsed = Date.parse(iso);
	if (Number.isNaN(parsed)) return null;
	const diffMs = Date.now() - parsed;
	return Math.max(0, Math.floor(diffMs / 86_400_000));
}

export function specAgeColor(days: number): string {
	if (days <= 30) return 'text-emerald-700 dark:text-emerald-400';
	if (days <= 90) return 'text-amber-700 dark:text-amber-400';
	return 'text-red-700 dark:text-red-400';
}

function parseSemver(value: null | string | undefined): [number, number, number] | null {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value ?? '');
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Text color for the `spk x.y.z` marker: how an app's synced template version compares to the
// spernakit template checkout aidd would sync from. Unknown/unparseable versions keep the
// surrounding neutral styling.
export function templateVersionColor(
	templateVersion: null | string,
	latestVersion: null | string | undefined
): string {
	const app = parseSemver(templateVersion);
	const latest = parseSemver(latestVersion);
	if (!app || !latest) return '';
	if (app[0] < latest[0]) return 'text-red-700 dark:text-red-400';
	const cmp =
		app[0] !== latest[0]
			? app[0] - latest[0]
			: app[1] !== latest[1]
				? app[1] - latest[1]
				: app[2] - latest[2];
	if (cmp < 0) return 'text-amber-700 dark:text-amber-400';
	if (cmp > 0) return 'text-teal-700 dark:text-teal-400';
	return 'text-emerald-700 dark:text-emerald-400';
}

export function featureProgressColor(pct: number): string {
	if (pct >= 100) return 'bg-emerald-500';
	if (pct <= 25) return 'bg-red-500';
	return 'bg-amber-500';
}

export function milestoneBadgeTone(ms: ProjectMilestoneSummary): BadgeTone {
	if (ms.total === 0) return 'neutral';
	if (ms.completed === ms.total) return 'emerald';
	if (ms.completed > 0) return 'cyan';
	return 'neutral';
}

export function isOrphaned(project: ProjectSummary): boolean {
	const { sync } = project.metadata;
	return sync.syncState === 'error' && !!sync.lastSyncError?.startsWith('ORPHAN:');
}
