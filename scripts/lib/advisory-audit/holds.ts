import { readFileSync } from 'node:fs';

import type { Hold, HoldStatus } from './types.ts';

/** A human-blocked hold older than this is flagged; an upstream-blocked one only shows its age. */
export const STALE_AFTER_DAYS = 30;

const BLOCKED_ON = new Set(['human', 'upstream']);

function isHold(value: unknown): value is Hold {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.tree === 'string' &&
		typeof v.package === 'string' &&
		typeof v.ghsa === 'string' &&
		typeof v.owner === 'string' &&
		typeof v.date === 'string' &&
		typeof v.reason === 'string' &&
		typeof v.blockedOn === 'string' &&
		BLOCKED_ON.has(v.blockedOn) &&
		(v.until === undefined || typeof v.until === 'string')
	);
}

/** Reads acknowledged-holds.json; a missing file is no holds, a malformed entry is an error. */
export function readHolds(path: string): Hold[] {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return [];
	}
	const parsed = JSON.parse(text) as unknown;
	if (!Array.isArray(parsed)) throw new Error(`${path}: expected an array of holds`);
	return parsed.map((entry, index) => {
		if (!isHold(entry)) throw new Error(`${path}: entry ${String(index)} is not a hold`);
		return entry;
	});
}

export function holdStatus(hold: Hold, now: Date): HoldStatus {
	const ageDays = Math.floor((now.getTime() - Date.parse(hold.date)) / 86_400_000);
	const pastUntil = hold.until !== undefined && now.getTime() > Date.parse(hold.until);
	// A fix that may never come is not anyone's inaction; only a human decision goes stale.
	const stale = hold.blockedOn === 'human' && (ageDays > STALE_AFTER_DAYS || pastUntil);
	return { ageDays, hold, stale };
}

/** The hold covering a finding, if any. */
export function findHold(holds: Hold[], tree: string, pkg: string, ghsa: string): Hold | undefined {
	return holds.find((h) => h.tree === tree && h.package === pkg && h.ghsa === ghsa);
}
