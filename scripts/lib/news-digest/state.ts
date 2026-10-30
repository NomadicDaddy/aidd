/**
 * The digest's memory of what it has already reported (`.news-digest/last-digest.json`). An item
 * first reported on an earlier day is never reported again; one first reported today came from an
 * earlier run of the same day and stays. Entries older than seven days are pruned.
 */
import { readFile, rename, writeFile } from 'node:fs/promises';

export interface DigestItem {
	firstReported: string;
	notes?: string;
	outlets?: string[];
	published?: string;
	title: string;
	url: string;
}

export interface DigestState {
	/** The end of the last advisories window a complete run listed; the next window starts here. */
	advisoriesThrough?: string;
	items: DigestItem[];
	notes?: unknown;
	updatedAt?: string;
}

const RETAIN_DAYS = 7;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDay(day: string): string {
	if (!DAY_PATTERN.test(day)) throw new Error(`Expected a YYYY-MM-DD date, got "${day}"`);
	return day;
}

export async function readState(path: string): Promise<DigestState> {
	const text = await readFile(path, 'utf8').catch((error: unknown) => {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '{"items":[]}';
		throw error;
	});
	const parsed = JSON.parse(text) as Partial<DigestState>;
	return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
}

// Written beside the target and renamed over it, so a run killed mid-write leaves the previous
// state whole instead of a truncated file every later run fails to parse.
export async function writeState(path: string, state: DigestState): Promise<void> {
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(state, null, '\t')}\n`, 'utf8');
	await rename(temp, path);
}

/** Items first reported before `day`: the ones a digest written on `day` must not repeat. */
export function knownBefore(state: DigestState, day: string): DigestItem[] {
	return state.items.filter((item) => item.firstReported < assertDay(day));
}

function cutoffDay(day: string): string {
	const date = new Date(`${assertDay(day)}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - RETAIN_DAYS);
	return date.toISOString().slice(0, 10);
}

export type NewItem = Omit<DigestItem, 'firstReported'>;

function asNewItem(value: unknown, index: number): NewItem {
	const item = value as null | Partial<NewItem>;
	if (!item || typeof item.title !== 'string' || typeof item.url !== 'string') {
		throw new Error(`Item ${index} needs a string title and url`);
	}
	return item as NewItem;
}

/** Parse an items file: a JSON array of { title, url, published?, outlets?, notes? }. */
export function parseNewItems(text: string): NewItem[] {
	const parsed = JSON.parse(text) as unknown;
	if (!Array.isArray(parsed)) throw new Error('Items file must hold a JSON array');
	return parsed.map(asNewItem);
}

export interface AddResult {
	added: number;
	alreadyRecorded: number;
	pruned: number;
	state: DigestState;
}

/** Record `day`'s new items once each, then drop entries older than the retention window. */
export function addItems(state: DigestState, day: string, items: NewItem[]): AddResult {
	const recorded = new Set(state.items.map((item) => item.url));
	const fresh = items.filter((item) => {
		if (recorded.has(item.url)) return false;
		recorded.add(item.url);
		return true;
	});
	const merged = [...state.items, ...fresh.map((item) => ({ ...item, firstReported: day }))];
	const cutoff = cutoffDay(day);
	const kept = merged.filter((item) => item.firstReported >= cutoff);
	return {
		added: fresh.length,
		alreadyRecorded: items.length - fresh.length,
		pruned: merged.length - kept.length,
		state: { ...state, items: kept, updatedAt: new Date().toISOString() },
	};
}

/**
 * Where `--start previous` begins: the end the last complete advisories run recorded. Each run
 * computing its own "24 hours ago" left gaps between windows (seconds on 2026-10-28/29, Roger
 * 83e038c3), so consecutive runs chain instead. With nothing recorded there is nothing to chain
 * from, and the caller has to name a start.
 */
export function previousAdvisoriesEnd(state: DigestState): string {
	if (state.advisoriesThrough === undefined) {
		throw new Error(
			'No advisories window is recorded yet; pass an explicit --start <ISO> once',
		);
	}
	return state.advisoriesThrough;
}

/** The state after a complete advisories run listed through `end`, never moving the mark back. */
export function recordAdvisoriesEnd(state: DigestState, end: string): DigestState {
	const at = Date.parse(end);
	if (Number.isNaN(at)) throw new Error(`Expected an ISO time for --end, got "${end}"`);
	const recorded = state.advisoriesThrough;
	if (recorded !== undefined && Date.parse(recorded) >= at) return state;
	return { ...state, advisoriesThrough: end };
}
