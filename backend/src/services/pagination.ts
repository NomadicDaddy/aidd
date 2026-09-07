// Cursor-based pagination primitive shared by run/session list endpoints. Cursors are
// opaque base64url-encoded JSON `{ startedAt, id }` keyed off the (startedAt DESC, id DESC)
// sort that all paginated tables use. The id tiebreaker lets pages stay stable when two rows
// share the same millisecond timestamp.

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface CursorKey {
	id: string;
	startedAt: number;
}

export interface CursorPage<T> {
	items: T[];
	nextCursor: null | string;
}

export function encodeCursor(cursor: CursorKey): string {
	return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): CursorKey | null {
	if (!value) return null;
	try {
		const decoded = Buffer.from(value, 'base64url').toString('utf8');
		const parsed: unknown = JSON.parse(decoded);
		if (!parsed || typeof parsed !== 'object') return null;
		const startedAt = (parsed as Record<string, unknown>).startedAt;
		const id = (parsed as Record<string, unknown>).id;
		if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
		if (typeof id !== 'string' || id.length === 0) return null;
		return { id, startedAt };
	} catch {
		return null;
	}
}

export function clampLimit(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_PAGE_LIMIT;
	}
	return Math.min(Math.floor(value), MAX_PAGE_LIMIT);
}
