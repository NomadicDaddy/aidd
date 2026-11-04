import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Staged into each app's .aidd/skills with no aidd packages beside it, so it uses only Node and
// Bun built-ins. The threshold and the length rule match aidd-shared's metadata/features/notes-size.ts,
// which raises the warning this trim answers; change both together.
export const NOTES_TRIM_THRESHOLD = 3000;

// The only fields a notes trim may change. Every other field must stay equal to the archive.
const TRIMMABLE = new Set(['notes', 'updatedAt']);

export interface LongNotes {
	chars: number;
	directory: string;
	status: null | string;
}

export interface TrimCheck {
	after: number;
	before: number;
	id: null | string;
	ok: boolean;
	reason: string;
	sha256: string;
}

export function noteTextLength(notes: unknown): number {
	if (typeof notes === 'string') return notes.length;
	if (!Array.isArray(notes)) return 0;
	let total = 0;
	for (const entry of notes) if (typeof entry === 'string') total += entry.length;
	return total;
}

function parseRecord(bytes: Uint8Array): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		throw new Error('Feature file must be valid UTF-8 JSON');
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Feature file must be a JSON object');
	}
	return value as Record<string, unknown>;
}

async function readRegularFile(path: string): Promise<Uint8Array> {
	const entry = await lstat(path);
	if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Not a regular file');
	return readFile(path);
}

function sha256Of(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export async function listLongNotes(
	featuresDir: string,
	threshold = NOTES_TRIM_THRESHOLD,
): Promise<LongNotes[]> {
	const found: LongNotes[] = [];
	for (const directory of (await readdir(featuresDir)).sort()) {
		let record: Record<string, unknown>;
		try {
			record = parseRecord(
				await readRegularFile(join(featuresDir, directory, 'feature.json')),
			);
		} catch {
			continue;
		}
		const chars = noteTextLength(record.notes);
		if (chars <= threshold) continue;
		const status = typeof record.status === 'string' ? record.status : null;
		found.push({ chars, directory, status });
	}
	return found.sort((a, b) => b.chars - a.chars);
}

/** Copies the exact bytes of a feature file into the archive folder, named for its directory. */
export async function archiveFeature(
	source: string,
	archiveDir: string,
): Promise<{ archive: string; chars: number; sha256: string }> {
	const bytes = await readRegularFile(source);
	const record = parseRecord(bytes);
	const archive = join(archiveDir, `${basename(dirname(source))}.feature.json`);
	await mkdir(archiveDir, { recursive: true });
	const existing = await readFile(archive).catch(() => null);
	if (existing !== null && sha256Of(existing) !== sha256Of(bytes)) {
		throw new Error('A different archive already exists under that name');
	}
	if (existing === null) await copyFile(source, archive);
	if (sha256Of(await readFile(archive)) !== sha256Of(bytes)) {
		throw new Error('Archive bytes do not match the source');
	}
	return { archive, chars: noteTextLength(record.notes), sha256: sha256Of(bytes) };
}

function changedProtectedField(
	live: Record<string, unknown>,
	original: Record<string, unknown>,
): null | string {
	const keys = new Set([...Object.keys(live), ...Object.keys(original)]);
	for (const key of keys) {
		if (TRIMMABLE.has(key)) continue;
		if (!Bun.deepEquals(live[key], original[key], true)) return key;
	}
	return null;
}

/**
 * The archive's path from its `.aidd` folder on, with forward slashes: the exact text a trimmed
 * note must cite. A file name alone would also match the same name in a different folder.
 */
export function archiveLink(archive: string): null | string {
	const path = resolve(archive).replaceAll('\\', '/');
	const at = path.lastIndexOf('/.aidd/');
	return at === -1 ? null : path.slice(at + 1);
}

// The skill's template text, exactly: a bare substring match let a longer path that merely
// contains the link (`<link>.old`, `D:/other/<link>`) pass as the citation.
function linksArchive(notes: unknown, link: string, sha256: string): boolean {
	if (!Array.isArray(notes) || notes.some((entry) => typeof entry !== 'string')) return false;
	const escaped = link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const citation = new RegExp(`(?:^|\\s)archived at ${escaped} \\(sha256 ${sha256}\\)`, 'i');
	return notes.some((entry: string) => citation.test(entry));
}

function trimReason(
	live: Record<string, unknown>,
	original: Record<string, unknown>,
	archive: string,
	sha256: string,
): string {
	const changed = changedProtectedField(live, original);
	if (changed !== null) return `field-changed:${changed}`;
	const link = archiveLink(archive);
	if (link === null) return 'archive-outside-aidd';
	if (!linksArchive(live.notes, link, sha256)) return 'notes-missing-archive-link';
	if (noteTextLength(live.notes) >= noteTextLength(original.notes)) return 'notes-not-shorter';
	return 'trimmed';
}

/** Checks a trimmed record against its archive: only notes and updatedAt may differ. */
export async function verifyTrim(
	source: string,
	archive: string,
	expectedSha256: string,
): Promise<TrimCheck> {
	if (!/^[a-f\d]{64}$/i.test(expectedSha256)) {
		throw new Error('Expected SHA256 must contain exactly 64 hexadecimal characters');
	}
	const archivedBytes = await readRegularFile(archive);
	const sha256 = sha256Of(archivedBytes);
	const original = parseRecord(archivedBytes);
	const live = parseRecord(await readRegularFile(source));
	const reason =
		sha256 === expectedSha256.toLowerCase()
			? trimReason(live, original, archive, sha256)
			: 'archive-changed';
	const id = typeof live.id === 'string' ? live.id : null;
	const before = noteTextLength(original.notes);
	const after = noteTextLength(live.notes);
	return { after, before, id, ok: reason === 'trimmed', reason, sha256 };
}

type Mode = 'archive' | 'list' | 'verify';

interface Options {
	archive?: string;
	'archive-dir'?: string;
	'expect-sha256'?: string;
	features?: string;
	mode: Mode;
	source?: string;
	threshold?: string;
}

function required(value: string | undefined, name: string): string {
	if (!value?.trim()) throw new Error(`--${name} is required`);
	return value;
}

async function runMode(options: Options): Promise<number> {
	if (options.mode === 'list') {
		const threshold = Number(options.threshold ?? NOTES_TRIM_THRESHOLD);
		if (!Number.isInteger(threshold) || threshold < 0) throw new Error('Invalid threshold');
		const found = await listLongNotes(required(options.features, 'features'), threshold);
		console.log(JSON.stringify({ mode: 'list', records: found, threshold }));
		return 0;
	}
	if (options.mode === 'archive') {
		const result = await archiveFeature(
			required(options.source, 'source'),
			required(options['archive-dir'], 'archive-dir'),
		);
		console.log(JSON.stringify({ mode: 'archive', ...result }));
		return 0;
	}
	const result = await verifyTrim(
		required(options.source, 'source'),
		required(options.archive, 'archive'),
		required(options['expect-sha256'], 'expect-sha256'),
	);
	console.log(JSON.stringify({ mode: 'verify', ...result }));
	return result.ok ? 0 : 1;
}

function parseOptions(argv: string[]): Options {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		args: argv,
		options: {
			archive: { type: 'string' },
			'archive-dir': { type: 'string' },
			'expect-sha256': { type: 'string' },
			features: { type: 'string' },
			source: { type: 'string' },
			threshold: { type: 'string' },
		},
		strict: true,
	});
	const [mode, ...rest] = positionals;
	if (rest.length > 0 || (mode !== 'list' && mode !== 'archive' && mode !== 'verify')) {
		throw new Error('Choose one mode: list, archive or verify');
	}
	return { ...values, mode };
}

export async function main(argv: string[]): Promise<number> {
	try {
		return await runMode(parseOptions(argv));
	} catch {
		// Parse errors can quote record text. Keep failure output independent of file values.
		console.error('Notes trim helper failed: unreadable/invalid input or invalid arguments.');
		return 1;
	}
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
