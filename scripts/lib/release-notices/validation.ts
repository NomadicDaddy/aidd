import { type CompileTarget } from '../../build-standalone.ts';
import { renderSourceManifest, type SourceRevisions } from '../release/source-manifest.ts';
import { type DistributedMaterialsRegistry } from '../third-party-licenses/registry-types.ts';
import { type ReleaseArchive } from './archive.ts';

export const REQUIRED_RUNTIME_FILES = [
	'LICENSE',
	'THIRD-PARTY-LICENSES.md',
	'THIRD-PARTY-NOTICES.md',
	'licenses/LGPL-2.0.txt',
	'licenses/LGPL-2.1.txt',
	'licenses/BUN-LICENSE.md',
	'licenses/distributed-materials.json',
	'licenses/SOURCE-OFFER.md',
	'licenses/SOURCE-MANIFEST.md',
] as const;

const RETIRED_CATALOG_ROOT = ['ingre', 'dients'].join('');
const RETIRED_CATALOG_PATHS = [
	`${RETIRED_CATALOG_ROOT}/`,
	'skills/frontend-design/',
	'skills/dogfood/',
	'skills/knip/',
	'skills/audit-review/references/source-vercel-',
] as const;

export interface ReleaseDirectoryEntry {
	isDirectory: boolean;
	isFile: boolean;
	name: string;
}

export function archiveName(version: string, target: CompileTarget): string {
	return `${stageName(version, target)}.zip`;
}

export function stageName(version: string, target: CompileTarget): string {
	return `aidd-v${version}-${target.name}`;
}

export function validateReleaseDirectory(
	entries: ReleaseDirectoryEntry[],
	version: string,
	targets: CompileTarget[],
): string[] {
	const expectedZips = targets.map((target) => archiveName(version, target)).sort();
	const actualZips = entries
		.filter((entry) => entry.isFile && entry.name.endsWith('.zip'))
		.map((entry) => entry.name)
		.sort();
	const expectedStages = targets.map((target) => stageName(version, target)).sort();
	const actualStages = entries
		.filter((entry) => entry.isDirectory)
		.map((entry) => entry.name)
		.sort();
	const issues: string[] = [];
	if (!sameStrings(actualZips, expectedZips)) {
		issues.push(`release ZIPs must be exactly: ${expectedZips.join(', ')}`);
	}
	if (!sameStrings(actualStages, expectedStages)) {
		issues.push(`release staging directories must be exactly: ${expectedStages.join(', ')}`);
	}
	return issues;
}

export function releaseArchiveRequiredPaths(registry: DistributedMaterialsRegistry): string[] {
	const required = new Set<string>(REQUIRED_RUNTIME_FILES);
	for (const material of registry.classifications.thirdParty) {
		if (!material.distributionSurfaces.includes('release-archive')) continue;
		for (const path of material.coveredPaths) required.add(path);
		for (const path of material.requiredNoticeFiles) required.add(path);
	}
	return [...required].sort();
}

export async function validateReleaseArchive(options: {
	archive: ReleaseArchive;
	catalogPaths: string[];
	requiredPaths: string[];
	revisions: SourceRevisions;
	stage: string;
}): Promise<string[]> {
	const { archive, catalogPaths, requiredPaths, revisions, stage } = options;
	const issues: string[] = [];
	const prefix = `${stage}/`;
	const outsideRoot = archive.entries
		.map((entry) => entry.path)
		.filter((path) => path !== stage && !path.startsWith(prefix));
	const filePaths = archive.entries
		.filter((entry) => !entry.isDirectory)
		.map((entry) => entry.path);
	if (outsideRoot.length > 0) {
		issues.push(`archive entries outside ${stage}/: ${outsideRoot.join(', ')}`);
	}
	const relativeFiles = filePaths
		.filter((path) => path.startsWith(prefix))
		.map((path) => path.slice(prefix.length));
	const duplicateFiles = duplicates(relativeFiles);
	if (duplicateFiles.length > 0) {
		issues.push(`duplicate archive paths: ${duplicateFiles.join(', ')}`);
	}

	for (const path of requiredPaths) {
		if (!relativeFiles.includes(path)) issues.push(`missing required archive file: ${path}`);
	}
	const actualCatalog = relativeFiles
		.filter((path) => catalogPaths.some((expected) => sameCatalogRoot(path, expected)))
		.sort();
	const expectedCatalog = [...catalogPaths].sort();
	for (const path of expectedCatalog) {
		if (!actualCatalog.includes(path)) issues.push(`missing catalog file: ${path}`);
	}
	for (const path of actualCatalog) {
		if (!expectedCatalog.includes(path)) issues.push(`unexpected catalog file: ${path}`);
	}
	for (const path of relativeFiles) {
		if (RETIRED_CATALOG_PATHS.some((retired) => path.includes(retired))) {
			issues.push(`retired catalog path is present: ${path}`);
		}
	}

	const manifestPath = `${stage}/licenses/SOURCE-MANIFEST.md`;
	if (filePaths.includes(manifestPath)) {
		const actual = normalizeText(await archive.readText(manifestPath));
		const expected = normalizeText(renderSourceManifest(revisions));
		if (actual !== expected) {
			issues.push('licenses/SOURCE-MANIFEST.md does not match the current source revisions');
		}
	}
	return issues;
}

function sameCatalogRoot(path: string, expected: string): boolean {
	const root = expected.split('/')[0];
	return path === root || path.startsWith(`${root}/`);
}

function sameStrings(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function duplicates(paths: string[]): string[] {
	const seen = new Set<string>();
	const repeated = new Set<string>();
	for (const path of paths) {
		if (seen.has(path)) repeated.add(path);
		seen.add(path);
	}
	return [...repeated].sort();
}

function normalizeText(text: string): string {
	return text.replaceAll('\r\n', '\n').trimEnd();
}
