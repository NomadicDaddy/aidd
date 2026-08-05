/**
 * Display strings for the matrix. The posture label is already sentence case, so the source badge
 * matches it here rather than printing the raw enum in lowercase beside it; `unsaved` is the word
 * the page description uses ("N unsaved profile edits"), where the badge used to say `dirty`.
 */
export function sourceLabel(source: string): string {
	if (source.length === 0) return source;
	return source.charAt(0).toUpperCase() + source.slice(1);
}

export const unsavedBadgeLabel = 'Unsaved';
