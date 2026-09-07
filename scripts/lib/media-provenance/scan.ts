import { type Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

// `site` is the GitHub Pages upload root (.github/workflows/pages.yml uploads it as-is), so an
// image that only ever lives there is still distributed and must be scanned before publication.
export const DISTRIBUTED_MEDIA_ROOTS = [
	'docs/assets',
	'frontend/public',
	'frontend/dist',
	'dist',
	'site',
] as const;

const MEDIA_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const PROVENANCE_MARKERS = ['c2pa.watermarked', 'caBX', 'c2pa', 'jumbf', 'JUMBF'] as const;

export interface MediaProvenanceFinding {
	marker: (typeof PROVENANCE_MARKERS)[number];
	offset: number;
	path: string;
}

export interface MediaProvenanceReport {
	examined: number;
	findings: MediaProvenanceFinding[];
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function toRepositoryPath(projectRoot: string, path: string): string {
	return relative(projectRoot, path).split(sep).join('/');
}

async function collectMediaFiles(directory: string): Promise<string[]> {
	let entries: Dirent<string>[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (err) {
		if (isMissing(err)) return [];
		throw err;
	}

	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectMediaFiles(path)));
		} else if (entry.isFile() && MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
			files.push(path);
		}
	}
	return files;
}

function findMarkerOffset(bytes: Uint8Array, marker: string): number {
	const haystack = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return haystack.indexOf(Buffer.from(marker, 'ascii'));
}

export async function scanDistributedMedia(
	projectRoot: string,
	roots: readonly string[] = DISTRIBUTED_MEDIA_ROOTS,
): Promise<MediaProvenanceReport> {
	const files = (
		await Promise.all(
			roots.map(async (root) => await collectMediaFiles(join(projectRoot, root))),
		)
	)
		.flat()
		.sort((left, right) => left.localeCompare(right));
	const findings: MediaProvenanceFinding[] = [];

	for (const file of files) {
		const bytes = await readFile(file);
		for (const marker of PROVENANCE_MARKERS) {
			const offset = findMarkerOffset(bytes, marker);
			if (offset >= 0)
				findings.push({ marker, offset, path: toRepositoryPath(projectRoot, file) });
		}
	}

	return { examined: files.length, findings };
}
