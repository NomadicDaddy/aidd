import type { ProjectMilestoneSummary, ProjectSummary } from '../../api/types.ts';
import type { BadgeTone } from './projects-list-shared.ts';

import { toneSolid, toneText } from '../../lib/tones.ts';

export function daysSince(iso: null | string): null | number {
	if (!iso) return null;
	const parsed = Date.parse(iso);
	if (Number.isNaN(parsed)) return null;
	const diffMs = Date.now() - parsed;
	return Math.max(0, Math.floor(diffMs / 86_400_000));
}

export function specAgeColor(days: number): string {
	if (days <= 30) return toneText.emerald;
	if (days <= 90) return toneText.amber;
	return toneText.red;
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
	latestVersion: null | string | undefined,
): string {
	const app = parseSemver(templateVersion);
	const latest = parseSemver(latestVersion);
	if (!app || !latest) return '';
	if (app[0] < latest[0]) return toneText.red;
	const cmp =
		app[0] !== latest[0]
			? app[0] - latest[0]
			: app[1] !== latest[1]
				? app[1] - latest[1]
				: app[2] - latest[2];
	if (cmp < 0) return toneText.amber;
	if (cmp > 0) return toneText.teal;
	return toneText.emerald;
}

export function featureProgressColor(pct: number): string {
	if (pct >= 100) return toneSolid.emerald;
	if (pct <= 25) return toneSolid.red;
	return toneSolid.amber;
}

/**
 * Complete milestones are toned; everything else is not.
 *
 * A complete milestone was `emerald` and an in-progress one `teal`. At badge size in dark mode
 * `text-emerald-300` and `text-teal-300` are two adjacent greens, so a row of chips read as one
 * undifferentiated colour and the distinction was carried entirely by the `3/5` each chip already
 * prints. Presence of colour is a difference legible at 11px; hue between neighbours on the wheel
 * is not.
 */
export function milestoneBadgeTone(ms: ProjectMilestoneSummary): BadgeTone {
	return ms.total > 0 && ms.completed === ms.total ? 'emerald' : 'neutral';
}

export function isOrphaned(project: ProjectSummary): boolean {
	const { sync } = project.metadata;
	return sync.syncState === 'error' && !!sync.lastSyncError?.startsWith('ORPHAN:');
}
