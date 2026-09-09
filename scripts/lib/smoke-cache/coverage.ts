import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export const TEST_COVERAGE_DIR = '.tmp-smoke-qc-coverage';
export const TEST_COVERAGE_LCOV_PATH = `${TEST_COVERAGE_DIR}/lcov.info`;

function normalizeRelativePath(path: string): string {
	return path.replaceAll('\\', '/');
}

function isInsideProject(relativePath: string): boolean {
	return (
		relativePath !== '' &&
		relativePath !== '..' &&
		!relativePath.startsWith(`..\\`) &&
		!relativePath.startsWith('../') &&
		!isAbsolute(relativePath)
	);
}

// Resolve a path through the filesystem so two spellings of the same location compare equal: a
// Windows `subst` drive, a symlink, a junction. Bun writes LCOV `SF:` entries as real paths while
// the project root is whatever spelling the process was launched with, so on such a setup every
// covered file otherwise reads as living outside the project. Returns the input unchanged when the
// path does not resolve, which keeps a genuinely foreign path foreign.
function realPath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

export function normalizeCoverageFile(projectRoot: string, sourceFile: string): string {
	const trimmed = sourceFile.trim();
	const absolutePath = isAbsolute(trimmed) ? resolve(trimmed) : resolve(projectRoot, trimmed);
	let relativePath = relative(projectRoot, absolutePath);

	// Only pay for the filesystem round trip when the plain comparison says "outside": that is
	// either a real escape or an aliased path, and only the second survives resolution.
	if (!isInsideProject(relativePath)) {
		relativePath = relative(realPath(projectRoot), realPath(absolutePath));
	}

	if (!isInsideProject(relativePath)) {
		throw new Error(`Coverage file is outside the project root: ${sourceFile}`);
	}

	return normalizeRelativePath(relativePath);
}

export function parseCoverageFiles(projectRoot: string, lcov: string): string[] {
	const files = new Set<string>();

	for (const line of lcov.split(/\r?\n/)) {
		if (!line.startsWith('SF:')) continue;
		files.add(normalizeCoverageFile(projectRoot, line.slice(3)));
	}

	return [...files].sort();
}

export async function readTestCoverageFiles(projectRoot: string): Promise<string[]> {
	const lcovPath = resolve(projectRoot, TEST_COVERAGE_LCOV_PATH);
	const lcov = await readFile(lcovPath, 'utf8');
	return parseCoverageFiles(projectRoot, lcov);
}
