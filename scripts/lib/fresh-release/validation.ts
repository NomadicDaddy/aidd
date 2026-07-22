import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readVersionInfo } from '../release/common.ts';

const BASELINE_VERSION = '2.130.1';
const CONTENT_ROOTS = [
	'.github/',
	'audits/',
	'docs/',
	'licenses/releases/',
	'scripts/',
	'test/scripts/',
] as const;

const POLICY_FIXTURES = new Set([
	'scripts/lib/fresh-release/validation.ts',
	'test/scripts/fresh-release.test.ts',
	'test/scripts/release-notices-validation.test.ts',
]);

const HISTORICAL_NARRATIVES = [
	/aidd used to ship/iu,
	/previously bundled/iu,
	/Releases shipped without/iu,
	/published v2\.\d+\.\d+/iu,
	/first release packaged with/iu,
] as const;

export async function validateFreshRelease(rootDir: string): Promise<string[]> {
	const info = await readVersionInfo(rootDir);
	const issues: string[] = [];
	if (compareVersions(info.packageVersion, BASELINE_VERSION) < 0) {
		issues.push(`current version ${info.packageVersion} predates baseline ${BASELINE_VERSION}`);
	}
	const trackedPaths = await listTrackedPaths(rootDir);
	for (const path of trackedPaths) {
		const file = Bun.file(join(rootDir, path));
		if (!(await file.exists())) continue;
		if (isHistoricalReleaseRecord(path)) {
			issues.push(`${path}: pre-baseline or withdrawal release record is tracked`);
		}
		if (!shouldInspect(path)) continue;
		const text = await readFile(join(rootDir, path), 'utf8').catch(() => '');
		for (const match of text.matchAll(/\b(?:aidd-v|aidd v)(2\.\d+\.\d+)\b/gu)) {
			const version = match[1];
			if (version !== undefined && compareVersions(version, BASELINE_VERSION) < 0) {
				issues.push(`${path}: references pre-baseline aidd release ${version}`);
			}
		}
		for (const pattern of HISTORICAL_NARRATIVES) {
			if (pattern.test(text)) issues.push(`${path}: contains retired repository narrative`);
		}
	}
	issues.push(...(await validateChangelog(rootDir, info.packageVersion)));
	return [...new Set(issues)].sort();
}

async function validateChangelog(rootDir: string, currentVersion: string): Promise<string[]> {
	const text = await readFile(join(rootDir, 'docs', 'CHANGELOG.md'), 'utf8');
	const headings = [...text.matchAll(/^## \[([^\]]+)\]/gmu)].map((match) => match[1]);
	const issues: string[] = [];
	if (headings.length !== 1 || headings[0] !== currentVersion) {
		issues.push(`docs/CHANGELOG.md: must contain exactly one ${currentVersion} release entry`);
	}
	for (const version of headings) {
		if (version !== undefined && compareVersions(version, BASELINE_VERSION) < 0) {
			issues.push(`docs/CHANGELOG.md: contains pre-baseline release ${version}`);
		}
	}
	return issues;
}

async function listTrackedPaths(rootDir: string): Promise<string[]> {
	const proc = Bun.spawn(['git', '-C', rootDir, 'ls-files'], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [exitCode, stderr, stdout] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
		new Response(proc.stdout).text(),
	]);
	if (exitCode !== 0) throw new Error(`Cannot enumerate tracked files: ${stderr.trim()}`);
	return stdout
		.split(/\r?\n/)
		.map((path) => path.trim().replaceAll('\\', '/'))
		.filter(Boolean);
}

function shouldInspect(path: string): boolean {
	if (POLICY_FIXTURES.has(path)) return false;
	return (
		['README.md', 'CONTEXT.md'].includes(path) ||
		CONTENT_ROOTS.some((root) => path.startsWith(root))
	);
}

function isHistoricalReleaseRecord(path: string): boolean {
	const match = /^licenses\/releases\/v(\d+\.\d+\.\d+)(?:-withdrawn)?\.md$/u.exec(path);
	if (match?.[1] === undefined) return false;
	return path.endsWith('-withdrawn.md') || compareVersions(match[1], BASELINE_VERSION) < 0;
}

function compareVersions(left: string, right: string): number {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}
