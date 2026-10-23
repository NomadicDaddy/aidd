/**
 * Moves daily digests older than a week out of the folder the reader opens. Phillip keeps the
 * daily `<YYYYMMDD>.md` files in `.news-digest\news\` and wants only the last seven days there,
 * the rest in `news\archive\` (#20632, #20641). Files are moved, never deleted, and a file that is
 * already in the archive under the same name is left where it is and reported, not overwritten.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

/** The daily digest file name: the day with its dashes removed. */
const DAILY_FILE = /^(\d{4})(\d{2})(\d{2})\.md$/;

/** How many days stay at the top of the news folder. */
export const KEEP_DAYS = 7;

export interface ArchiveResult {
	/** Daily files moved into the archive. */
	moved: string[];
	/** Daily files due for the archive but left in place: the archive already has that name. */
	skipped: string[];
}

/** The day `days` before `day` (both YYYY-MM-DD), in UTC so no zone shifts it. */
function daysBefore(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
}

/**
 * Moves every daily digest in `newsDir` dated more than `KEEP_DAYS` before `today` into
 * `newsDir/archive`.
 *
 * @param newsDir - The folder holding the daily `<YYYYMMDD>.md` files.
 * @param today - The run's day, YYYY-MM-DD.
 * @returns The files moved, and the ones left because the archive already had them.
 */
export async function archiveOldDigests(newsDir: string, today: string): Promise<ArchiveResult> {
	const cutoff = daysBefore(today, KEEP_DAYS);
	const archiveDir = join(newsDir, 'archive');
	const result: ArchiveResult = { moved: [], skipped: [] };
	const names = (await readdir(newsDir, { withFileTypes: true }))
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();
	for (const name of names) {
		const match = DAILY_FILE.exec(name);
		if (!match) continue;
		const day = `${match[1] ?? ''}-${match[2] ?? ''}-${match[3] ?? ''}`;
		if (day >= cutoff) continue;
		const target = join(archiveDir, name);
		if (existsSync(target)) {
			result.skipped.push(name);
			continue;
		}
		await mkdir(archiveDir, { recursive: true });
		await rename(join(newsDir, name), target);
		result.moved.push(name);
	}
	return result;
}
