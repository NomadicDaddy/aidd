/**
 * The web backend's `logs/backend.pid` record. It names the backend's process and that process's
 * start-time token (`ProcessTableEntry.startId`), so a reader can tell the backend from an
 * unrelated process that later received the same pid. Windows recycles pids quickly; a bare
 * number left behind by a crashed backend can name any process days later.
 */
export interface WebPidRecord {
	pid: number;
	/** Absent only when the platform could not report a start time for the backend. */
	startId?: string;
}

export function formatWebPidRecord(record: WebPidRecord): string {
	return `${JSON.stringify(record)}\n`;
}

/** Returns null for anything that is not a well-formed record. */
export function parseWebPidRecord(text: string): null | WebPidRecord {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!value || typeof value !== 'object') return null;
	const { pid, startId } = value as { pid?: unknown; startId?: unknown };
	if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;
	if (startId !== undefined && (typeof startId !== 'string' || startId.length === 0)) return null;
	return startId === undefined ? { pid } : { pid, startId };
}
