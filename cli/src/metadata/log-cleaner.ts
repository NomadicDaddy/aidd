import { scrubSecrets } from 'aidd-shared/lib/secretScrubber';
import { stripAnsi } from 'aidd-shared/text/ansi';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface LogCleanResult {
	cleanedFiles: number;
	scannedFiles: number;
}

export { stripAnsi } from 'aidd-shared/text/ansi';

// Recorded inside the `.cleaned` marker and bumped whenever this cleaner learns a new
// transformation. The marker's mtime is what lets a repeat scan skip untouched logs; without a
// version alongside it, logs written before a new pass existed would be skipped forever on their
// mtime alone. A mismatch forces one full re-sweep, which is what backfills them.
const CLEANER_VERSION = 'v2-secrets';

// ANSI first: an escape sequence sitting inside a token would otherwise split it and defeat every
// secret rule. Scrubbing second sees the reassembled text.
function cleanText(value: string): string {
	return scrubSecrets(stripAnsi(value));
}

function cleanValue(value: unknown): unknown {
	if (typeof value === 'string') return cleanText(value);
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

// The structured sidecar is one pretty-printed document, not JSONL, so the per-line parse below
// would never see it as JSON and would fall through to raw text. Walking the parsed document
// instead keeps redaction inside string values, where it cannot disturb the structure that
// log-extract.ts parses on every report.
function cleanJsonDocument(raw: string): { changed: boolean; content: string } | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	const content = `${JSON.stringify(cleanValue(parsed), null, 2)}\n`;
	return { changed: content !== raw, content };
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
			const cleaned = cleanText(line);
			if (cleaned !== line) changed = true;
			return cleaned;
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
	// `.json` sidecars carry the same raw text as the transcript — the commands the agent ran, the
	// paths it touched — and were never swept, so a credential redacted from `NNN.log` survived
	// untouched in `NNN.json` right beside it.
	return entries
		.filter((entry) => /^\d+\.(json|log)$/.test(entry))
		.sort()
		.map((entry) => join(iterationsDir, entry));
}

// `undefined` means "scan everything": either no marker, an unreadable one, or one left by an
// older cleaner whose sweep did not include the passes this version runs.
async function readMarkerMtime(markerPath: string): Promise<number | undefined> {
	try {
		const stats = await stat(markerPath);
		const version = (await readFile(markerPath, 'utf8')).trim();
		return version === CLEANER_VERSION ? stats.mtimeMs : undefined;
	} catch {
		return undefined;
	}
}

async function touchMarker(markerPath: string): Promise<void> {
	// Always rewrite rather than `utimes`: the file now carries the version that swept this
	// directory, and a touch would leave a stale one claiming coverage it never had.
	await writeFile(markerPath, `${CLEANER_VERSION}\n`);
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
		// A sidecar that will not parse falls back to the line-based path rather than being skipped:
		// redacting it as text is still better than leaving a credential in place.
		const { changed, content } =
			(file.endsWith('.json') ? cleanJsonDocument(raw) : undefined) ?? cleanLogContent(raw);
		if (changed) {
			await writeFile(file, content);
			cleanedFiles++;
		}
	}
	if (scannedFiles > 0) await touchMarker(markerPath);
	return { cleanedFiles, scannedFiles };
}
