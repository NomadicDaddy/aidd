import { readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// eslint-disable-next-line no-control-regex
const ansiPattern = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[=>(]B?|\x07/g;

export interface LogCleanResult {
	cleanedFiles: number;
	scannedFiles: number;
}

export function stripAnsi(value: string): string {
	return value.replace(ansiPattern, '');
}

function cleanValue(value: unknown): unknown {
	if (typeof value === 'string') return stripAnsi(value);
	if (Array.isArray(value)) return value.map(cleanValue);
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			result[key] = cleanValue(entry);
		}
		return result;
	}
	return value;
}

function cleanLogContent(raw: string): { changed: boolean; content: string } {
	let changed = false;
	const lines = raw.split(/\r?\n/);
	const cleaned = lines.map((line) => {
		if (!line) return line;
		try {
			const parsed = JSON.parse(line);
			const next = cleanValue(parsed);
			const serialized = JSON.stringify(next);
			if (serialized !== line) changed = true;
			return serialized;
		} catch {
			const stripped = stripAnsi(line);
			if (stripped !== line) changed = true;
			return stripped;
		}
	});
	return { changed, content: cleaned.join('\n') };
}

async function listLogFiles(iterationsDir: string): Promise<string[]> {
	let entries: string[];
	try {
		entries = await readdir(iterationsDir);
	} catch {
		return [];
	}
	return entries
		.filter((entry) => /^\d+\.log$/.test(entry))
		.sort()
		.map((entry) => join(iterationsDir, entry));
}

async function readMarkerMtime(markerPath: string): Promise<number | undefined> {
	try {
		const stats = await stat(markerPath);
		return stats.mtimeMs;
	} catch {
		return undefined;
	}
}

async function touchMarker(markerPath: string): Promise<void> {
	const now = new Date();
	try {
		await utimes(markerPath, now, now);
	} catch {
		await writeFile(markerPath, '');
	}
}

export async function cleanIterationLogs(iterationsDir: string): Promise<LogCleanResult> {
	const files = await listLogFiles(iterationsDir);
	const markerPath = join(iterationsDir, '.cleaned');
	const markerMtime = await readMarkerMtime(markerPath);
	let scannedFiles = 0;
	let cleanedFiles = 0;
	for (const file of files) {
		const stats = await stat(file).catch(() => undefined);
		if (!stats) continue;
		if (markerMtime !== undefined && stats.mtimeMs <= markerMtime) continue;
		scannedFiles++;
		const raw = await readFile(file, 'utf8');
		const { changed, content } = cleanLogContent(raw);
		if (changed) {
			await writeFile(file, content);
			cleanedFiles++;
		}
	}
	if (scannedFiles > 0) await touchMarker(markerPath);
	return { cleanedFiles, scannedFiles };
}
