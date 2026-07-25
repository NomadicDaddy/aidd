export function formatDate(value: null | number | string | undefined): string {
	if (value === null || value === undefined) return 'Never';
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

export function formatDuration(ms: null | number | undefined): string {
	if (!ms) return '0s';
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

/**
 * Formats elapsed time for a session that may still be active. When `durationMs`
 * has been persisted (terminal session) it is used directly via `formatDuration`.
 * While `durationMs` is null/undefined (queued or running), the live elapsed time
 * is derived from `startedAt` and the supplied `now` value so the label advances
 * past `0s` before the backend writes the final duration.
 */
export function formatActiveDuration(
	durationMs: null | number | undefined,
	startedAt: null | number | undefined,
	now: number,
): string {
	if (durationMs !== null && durationMs !== undefined) return formatDuration(durationMs);
	if (startedAt === null || startedAt === undefined) return formatDuration(durationMs);
	return formatDuration(now - startedAt);
}

export function percent(value: number, total: number): number {
	if (total === 0) return 0;
	return Math.round((value / total) * 100);
}

export function formatRelativeAge(value: null | string | undefined): string {
	if (!value) return '—';
	const then = new Date(value).getTime();
	if (!Number.isFinite(then)) return '—';
	const diffMs = Date.now() - then;
	if (diffMs < 0) return 'just now';
	const days = Math.floor(diffMs / 86_400_000);
	if (days >= 1) return days === 1 ? '1d ago' : `${days}d ago`;
	const hours = Math.floor(diffMs / 3_600_000);
	if (hours >= 1) return hours === 1 ? '1h ago' : `${hours}h ago`;
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes >= 1) return minutes === 1 ? '1m ago' : `${minutes}m ago`;
	return 'just now';
}

/**
 * Relative "updated Ns ago" label for a freshness indicator. Unlike `formatRelativeAge`, this
 * takes an explicit `now` (so it can advance on a ticking clock without a data refetch) and a
 * millisecond timestamp (TanStack Query's `dataUpdatedAt`), and it has second-level granularity
 * for the first minute so a just-refreshed surface reads "Updated 12s ago" rather than "just now".
 */
export function formatUpdatedAgo(updatedAt: number, now: number): string {
	if (!updatedAt) return 'not yet';
	const diffMs = Math.max(0, now - updatedAt);
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 5) return 'just now';
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return minutes === 1 ? '1m ago' : `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return hours === 1 ? '1h ago' : `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? '1d ago' : `${days}d ago`;
}

export function formatBytes(value: null | number | undefined): string {
	if (value === null || value === undefined || value <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = value;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit += 1;
	}
	// Whole bytes read cleaner without a decimal; larger units keep one significant fraction.
	const rounded = unit === 0 ? Math.round(size) : Math.round(size * 10) / 10;
	return `${rounded} ${units[unit]}`;
}

export function formatCount(value: null | number | undefined): string {
	if (value === null || value === undefined) return '—';
	return String(value);
}

const compactFormatter = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
	notation: 'compact',
});

export function formatCompactNumber(value: null | number | undefined): string {
	if (value === null || value === undefined) return '—';
	return compactFormatter.format(value);
}

export function formatRatio(
	value: null | number | undefined,
	total: null | number | undefined,
): string {
	if (value === null || value === undefined || total === null || total === undefined) return '—';
	return `${value}/${total}`;
}
