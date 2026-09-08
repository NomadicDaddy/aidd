import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readVersionInfo } from '../release/common.ts';

const BASELINE_VERSION = '3.0.0';
const CONTENT_ROOTS = [
	'.github/',
	'audits/',
	'backend/',
	'docs/',
	'licenses/releases/',
	'scripts/',
	'shared/',
	'test/scripts/',
] as const;

const POLICY_FIXTURES = new Set([
	'scripts/lib/fresh-release/validation.ts',
	'test/scripts/fresh-release.test.ts',
]);

const PUBLIC_COPY_ROOTS = ['docs/', 'frontend/content/', 'site/'] as const;
const PUBLIC_COPY_FILES = new Set(['README.md']);

const PAID_PRODUCT_REFERENCES = [
	/\baidd Pro\b/iu,
	/\bpaid (?:capabilit(?:y|ies)|edition|features?|product|tier|version)\b/iu,
	/\bPro (?:capabilit(?:y|ies)|edition|features?|product|tier|version)\b/iu,
	/\baidd.{0,80}\b(?:paid|Pro) plan\b/iu,
	/\b(?:paid|Pro) plan\b.{0,80}\baidd\b/iu,
	/\baidd.{0,80}\bpricing tiers?\b/iu,
	/\bpricing tiers?\b.{0,80}\baidd\b/iu,
	/\bproduct key\b/iu,
	/\bactivation key\b/iu,
	/\b(?:aidd|product) activation\b/iu,
	/\bno activation\b/iu,
	/\bnothing to activate\b/iu,
	/\bruntime entitlements?\b/iu,
	/\bone and only edition\b/iu,
	/\benterprise licen[cs]e\b/iu,
	/\bwhite-label\b/iu,
] as const;

const HISTORICAL_NARRATIVES = [
	/aidd used to ship/iu,
	/compiled standalone binary/iu,
	/compiled-binary branch/iu,
	/next to the binary/iu,
	/not present in the standalone binaries/iu,
	/previously bundled/iu,
	/Releases shipped without/iu,
	/published v2\.\d+\.\d+/iu,
	/first release packaged with/iu,
	/standalone build was retired/iu,
	/went with the standalone build/iu,
] as const;

const RETIRED_DISTRIBUTION_REFERENCES = [
	/\baidd-v\d+\.\d+\.\d+-bun-[\w-]+\.zip\b/iu,
	/\baidd-web\.exe\b/iu,
	/\bprebuilt Windows archive\b/iu,
	/\bSHA256SUMS\.txt\b/u,
	/\bSOURCE-MANIFEST\.md\b/u,
	/\bstandalone zip\b/iu,
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
		if (isRetiredDistributionArtifact(path)) {
			issues.push(`${path}: retired binary or container distribution artifact is tracked`);
		}
		if (isHistoricalReleaseRecord(path)) {
			issues.push(`${path}: pre-baseline or withdrawal release record is tracked`);
		}
		const inspectReleasePolicy = shouldInspect(path);
		const inspectPublicCopy = shouldInspectPublicCopy(path);
		if (!inspectReleasePolicy && !inspectPublicCopy) continue;
		const text = await readFile(join(rootDir, path), 'utf8').catch(() => '');
		if (inspectPublicCopy) {
			for (const pattern of PAID_PRODUCT_REFERENCES) {
				if (pattern.test(text)) {
					issues.push(`${path}: references a paid or gated aidd product variant`);
				}
			}
		}
		if (!inspectReleasePolicy) continue;
		for (const match of text.matchAll(/\b(?:aidd-v|aidd v)(2\.\d+\.\d+)\b/gu)) {
			const version = match[1];
			if (version !== undefined && compareVersions(version, BASELINE_VERSION) < 0) {
				issues.push(`${path}: references pre-baseline aidd release ${version}`);
			}
		}
		for (const pattern of HISTORICAL_NARRATIVES) {
			if (pattern.test(text)) issues.push(`${path}: contains retired repository narrative`);
		}
		for (const pattern of RETIRED_DISTRIBUTION_REFERENCES) {
			if (pattern.test(text)) issues.push(`${path}: references retired binary distribution`);
		}
	}
	issues.push(...(await validateChangelog(rootDir, info.packageVersion)));
	return [...new Set(issues)].sort();
}

function isRetiredDistributionArtifact(path: string): boolean {
	return (
		path === '.dockerignore' ||
		path === 'Dockerfile' ||
		/^compose\.(?:env|vars)(?:\.|$)/u.test(path) ||
		/^docker\//u.test(path) ||
		/^docker-compose(?:\.[^/]+)?\.ya?ml$/u.test(path)
	);
}

async function validateChangelog(rootDir: string, currentVersion: string): Promise<string[]> {
	const text = await readFile(join(rootDir, 'docs', 'CHANGELOG.md'), 'utf8');
	const headings = [...text.matchAll(/^## \[([^\]]+)\]/gmu)].map((match) => match[1]);
	const issues: string[] = [];
	if (headings[0] !== currentVersion) {
		issues.push(`docs/CHANGELOG.md: must start with the ${currentVersion} release entry`);
	}
	let previousVersion: string | undefined;
	for (const version of headings) {
		if (version === undefined) continue;
		if (previousVersion !== undefined && compareVersions(version, previousVersion) >= 0) {
			issues.push('docs/CHANGELOG.md: release entries must be unique and newest first');
		}
		if (compareVersions(version, BASELINE_VERSION) < 0) {
			issues.push(`docs/CHANGELOG.md: contains pre-baseline release ${version}`);
		}
		previousVersion = version;
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
		['CONTEXT.md', 'README.md'].includes(path) ||
		CONTENT_ROOTS.some((root) => path.startsWith(root))
	);
}

function shouldInspectPublicCopy(path: string): boolean {
	return PUBLIC_COPY_FILES.has(path) || PUBLIC_COPY_ROOTS.some((root) => path.startsWith(root));
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
