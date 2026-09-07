/**
 * Display strings for the matrix. The posture label is already sentence case, so the source badge
 * matches it here rather than printing the raw enum in lowercase beside it; `unsaved` is the word
 * the page description uses ("N unsaved profile edits"), so the badge does not say `dirty`.
 */
export function sourceLabel(source: string): string {
	if (source.length === 0) return source;
	return source.charAt(0).toUpperCase() + source.slice(1);
}

export const unsavedBadgeLabel = 'Unsaved';

export function unsavedProfileEditLabel(count: number): string {
	return `${count} unsaved profile edit${count === 1 ? '' : 's'}`;
}

/**
 * When the profile was last written. It lives here, not in the row, because the card stack has to
 * print the same string the table does — a viewport that silently drops a column is the defect the
 * split was supposed to avoid, and two copies of a formatter is how it comes back.
 */
export function formatUpdatedAt(value: string): string {
	if (!value) return 'Unknown';
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

/** `3 hardening triggers`, pluralised — the sub-line under the posture badge in both layouts. */
export function hardeningTriggerLabel(count: number): string {
	return `${count} hardening trigger${count === 1 ? '' : 's'}`;
}
