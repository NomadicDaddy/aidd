import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type ParsedDiaryEntry, parseDiaryEntry } from './parse.ts';

// Filesystem side of diary indexing: walk a project's `.aidd/diary/YYYY/MM/DD.md` tree and parse
// each entry. Runs on the main thread (async fs); the parsed results are handed to the
// reconcileDiaryEntries worker command. Missing directories are normal (most projects have no
// diary yet) and yield an empty result rather than an error.

const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^\d{2}$/;
const DAY_FILE_PATTERN = /^(\d{2})\.md$/;

export interface ScanProjectDiaryResult {
	entries: ParsedDiaryEntry[];
	skipped: { error: string; path: string }[];
}

async function safeReaddir(dir: string): Promise<string[]> {
	try {
		return await readdir(dir);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
}

export async function scanProjectDiary(
	projectPath: string,
	projectName: string,
): Promise<ScanProjectDiaryResult> {
	const diaryRoot = join(projectPath, '.aidd', 'diary');
	const entries: ParsedDiaryEntry[] = [];
	const skipped: { error: string; path: string }[] = [];

	for (const year of await safeReaddir(diaryRoot)) {
		if (!YEAR_PATTERN.test(year)) continue;
		const yearDir = join(diaryRoot, year);
		for (const month of await safeReaddir(yearDir)) {
			if (!MONTH_PATTERN.test(month)) continue;
			const monthDir = join(yearDir, month);
			for (const file of await safeReaddir(monthDir)) {
				const dayMatch = DAY_FILE_PATTERN.exec(file);
				if (!dayMatch) continue;
				const filePath = join(monthDir, file);
				const entryDate = `${year}-${month}-${dayMatch[1]}`;
				try {
					const [body, stats] = await Promise.all([
						readFile(filePath, 'utf8'),
						stat(filePath),
					]);
					const parsed = parseDiaryEntry({
						body,
						entryDate,
						fileMtimeMs: Math.round(stats.mtimeMs),
						filePath,
						projectName,
						projectPath,
					});
					if ('error' in parsed) {
						skipped.push({ error: parsed.error, path: filePath });
						continue;
					}
					entries.push(parsed);
				} catch (err) {
					skipped.push({
						error: err instanceof Error ? err.message : String(err),
						path: filePath,
					});
				}
			}
		}
	}

	return { entries, skipped };
}
