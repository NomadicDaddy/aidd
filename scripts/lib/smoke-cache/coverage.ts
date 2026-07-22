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

export function normalizeCoverageFile(projectRoot: string, sourceFile: string): string {
	const trimmed = sourceFile.trim();
	const absolutePath = isAbsolute(trimmed) ? resolve(trimmed) : resolve(projectRoot, trimmed);
	const relativePath = relative(projectRoot, absolutePath);

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
