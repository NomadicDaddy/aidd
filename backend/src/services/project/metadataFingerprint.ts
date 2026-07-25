import { metadataPath } from 'aidd-shared/metadata/paths';
import { projectPackageManifestPaths } from 'aidd-shared/metadata/project-stack';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
	ITERATION_SCAN_LIMIT,
	iterationEntryNumber,
} from '../projectMetadata/iterationParseHelpers.ts';
import { runtimePortDeclarationPaths } from '../projectMetadata/runtimePortDiscovery.ts';

export interface ProjectFingerprintOptions {
	containingRoot?: string;
	spernakitFleetManifest?: null | string;
}

const METADATA_FILES = [
	'spec.md',
	'roadmap.json',
	'runs.jsonl',
	'.artifacts-check.json',
	'project-profile.json',
	'screen-map.md',
	'testing-scenarios.md',
	'questions.md',
	'responses.md',
] as const;

const PROJECT_ROOT_FILES = ['package.json', 'AGENTS.md', 'CLAUDE.md'] as const;

async function fingerprintTarget(path: string): Promise<string> {
	try {
		const result = await stat(path);
		return `${result.size}:${result.mtimeMs}`;
	} catch {
		return '-';
	}
}

async function fingerprintDirShallow(dir: string): Promise<string> {
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return '-';
	}
	entries.sort();
	const parts = await Promise.all(
		entries.map(async (name) => `${name}:${await fingerprintTarget(join(dir, name))}`),
	);
	return parts.join(',');
}

// iterations/ is append-only run history that grows by two files per iteration and is
// never pruned, so a shallow fingerprint of the whole directory made cache validation
// scale with a project's lifetime run count (~1,700 stats on a mature project) — far more
// work than the compute it guards. gatherLocalIterations only ever reads the newest
// ITERATION_SCAN_LIMIT `NNN.json` artifacts and ignores their .log siblings entirely, so
// the summary cannot reflect anything outside that window. Stat exactly that window, plus
// the raw entry count so additions and deletions still invalidate. An in-place edit to an
// artifact older than the window goes unnoticed, which is sound precisely because the
// listing cannot surface it.
async function fingerprintIterationsDir(dir: string): Promise<string> {
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return '-';
	}
	const newest = entries
		.map((entry) => ({ entry, number: iterationEntryNumber(entry) }))
		.filter((item): item is { entry: string; number: number } => item.number !== null)
		.sort((left, right) => right.number - left.number)
		.slice(0, ITERATION_SCAN_LIMIT);
	const parts = await Promise.all(
		newest.map(async ({ entry }) => `${entry}:${await fingerprintTarget(join(dir, entry))}`),
	);
	return `${entries.length}:${parts.join(',')}`;
}

async function resolveGitDir(projectDir: string): Promise<null | string> {
	const gitPath = join(projectDir, '.git');
	try {
		const gitStat = await stat(gitPath);
		if (gitStat.isDirectory()) return gitPath;
		if (gitStat.isFile()) {
			const pointer = (await readFile(gitPath, 'utf8')).trim();
			const match = pointer.match(/^gitdir:\s*(.+)$/);
			if (!match?.[1]) return null;
			const target = match[1].trim();
			return isAbsolute(target) ? target : join(projectDir, target);
		}
	} catch {
		return null;
	}
	return null;
}

async function fingerprintGitHead(projectDir: string): Promise<string> {
	const gitDir = await resolveGitDir(projectDir);
	if (!gitDir) return '-';
	let headContent: string;
	try {
		headContent = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
	} catch {
		return '-';
	}
	const refPath = headContent.startsWith('ref: ') ? headContent.slice(5).trim() : null;
	const targets = [
		join(gitDir, 'HEAD'),
		join(gitDir, 'logs', 'HEAD'),
		join(gitDir, 'packed-refs'),
	];
	if (refPath) targets.push(join(gitDir, refPath));
	const parts = await Promise.all(targets.map(fingerprintTarget));
	return `${headContent}|${parts.join('|')}`;
}

async function fingerprintFeaturesDir(featuresDir: string): Promise<string> {
	let entries: string[];
	try {
		entries = await readdir(featuresDir);
	} catch {
		return '-';
	}
	entries.sort();
	const parts = await Promise.all(
		entries.map(
			async (name) =>
				`${name}:${await fingerprintTarget(join(featuresDir, name, 'feature.json'))}`,
		),
	);
	return parts.join(',');
}

export async function computeProjectFingerprint(
	projectDir: string,
	options: ProjectFingerprintOptions = {},
): Promise<string> {
	const metadataDir = metadataPath(projectDir);
	const slug = (projectDir.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
	const containingRoot = options.containingRoot ? resolve(options.containingRoot) : null;
	const [manifestPaths, runtimePortPaths] = await Promise.all([
		projectPackageManifestPaths(projectDir),
		runtimePortDeclarationPaths(projectDir),
	]);
	const flatTargets = [
		...PROJECT_ROOT_FILES.map((name) => join(projectDir, name)),
		...(containingRoot && containingRoot !== resolve(projectDir)
			? PROJECT_ROOT_FILES.slice(1).map((name) => join(containingRoot, name))
			: []),
		...(options.spernakitFleetManifest ? [options.spernakitFleetManifest] : []),
		...runtimePortPaths,
		join(projectDir, 'config.json'),
		join(projectDir, 'config', `${slug}.json`),
		...METADATA_FILES.map((name) => join(metadataDir, name)),
	];
	const stackDirectories = new Set<string>([projectDir]);
	for (const manifestPath of manifestPaths) {
		const packageDir = dirname(manifestPath);
		stackDirectories.add(packageDir);
		stackDirectories.add(join(packageDir, 'src'));
	}
	const [flat, features, iterations, responses, auditReports, gitHead, configDir, stackFiles] =
		await Promise.all([
			Promise.all(flatTargets.map(fingerprintTarget)),
			fingerprintFeaturesDir(join(metadataDir, 'features')),
			fingerprintIterationsDir(join(metadataDir, 'iterations')),
			fingerprintDirShallow(join(metadataDir, 'responses')),
			fingerprintDirShallow(join(metadataDir, 'audit-reports')),
			fingerprintGitHead(projectDir),
			fingerprintDirShallow(join(projectDir, 'config')),
			Promise.all([...stackDirectories].sort().map(fingerprintDirShallow)),
		]);
	return [
		flat.join('|'),
		`features=${features}`,
		`iterations=${iterations}`,
		`responses=${responses}`,
		`audit-reports=${auditReports}`,
		`git-head=${gitHead}`,
		`config-dir=${configDir}`,
		`stack-files=${stackFiles.join('|')}`,
	].join('||');
}
