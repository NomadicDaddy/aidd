import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	copyTrackedFiles,
	expectedPackagedTrackedSurfaces,
} from '../../scripts/lib/third-party-licenses/distributed-paths.ts';
import { copyAssets } from '../../scripts/lib/standalone/distribution.ts';
import { CORE_CATALOG_DIRS, REQUIRED_FILE_ASSETS } from '../../scripts/lib/standalone/constants.ts';
import {
	renderRegistryNotices,
	renderRegistrySummary,
} from '../../scripts/lib/third-party-licenses/registry-render.ts';
import { parseDistributedMaterialsRegistry } from '../../scripts/lib/third-party-licenses/registry-schema.ts';
import { validateDistributedMaterialsRegistry } from '../../scripts/lib/third-party-licenses/registry-validation.ts';
import {
	type DistributedMaterialsRegistry,
	type ThirdPartyMaterial,
} from '../../scripts/lib/third-party-licenses/registry-types.ts';
import { testTempDir } from '../_helpers/temp.ts';

const REVISION = '4559f18a20c1691c744b4395194290db6a0df5e9';
const PATHS = [
	'README.md',
	'THIRD-PARTY-LICENSES.md',
	'THIRD-PARTY-NOTICES.md',
	'audits/example.md',
	'licenses/distributed-materials.json',
];
async function runGit(root: string, ...args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', root, ...args], {
		stderr: 'pipe',
		stdout: 'ignore',
		windowsHide: true,
	});
	const stderr = await new Response(proc.stderr).text();
	if ((await proc.exited) !== 0)
		throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
}

function material(): ThirdPartyMaterial {
	return {
		authorOrRightsholder: 'Example Authors',
		coveredPaths: ['audits/example.md'],
		distributionSurfaces: ['source-tree', 'release-archive'],
		id: 'example-audit',
		licenseEvidenceUrl: `https://github.com/example/project/blob/${REVISION}/LICENSE`,
		licenseExpression: 'MIT',
		modificationStatus: 'adapted',
		noticeText: 'aidd adapts the example material.',
		provenanceVerified: '2026-07-21',
		provenanceEvidence: 'Compared every upstream rule; the local audit was aligned.',
		requiredNoticeFiles: ['THIRD-PARTY-LICENSES.md', 'THIRD-PARTY-NOTICES.md'],
		sourceRevision: REVISION,
		sourceUrl: `https://github.com/example/project/blob/${REVISION}/source.md`,
	};
}

function registry(): DistributedMaterialsRegistry {
	const packaged = expectedPackagedTrackedSurfaces();
	return {
		classifications: {
			firstParty: ['README.md', 'licenses/distributed-materials.json'],
			generated: ['THIRD-PARTY-LICENSES.md', 'THIRD-PARTY-NOTICES.md'],
			thirdParty: [material()],
		},
		pathContract: 'Exact paths only.',
		schemaVersion: 1,
		trackedSurfaces: {
			catalogRoots: packaged.catalogRoots,
			publicDocumentPaths: packaged.publicDocumentPaths,
			publicDocumentRoots: packaged.publicDocumentRoots,
			publicStaticAssetRoots: ['frontend/public'],
		},
		verifiedDate: '2026-07-21',
	};
}

async function writeStandaloneFixture(
	root: string
): Promise<{ catalogPaths: string[]; value: DistributedMaterialsRegistry }> {
	const catalogPaths = CORE_CATALOG_DIRS.map((directory) =>
		directory === 'audits' ? 'audits/example.md' : `${directory}/example.txt`
	);
	const value = registry();
	value.classifications.firstParty = [
		...catalogPaths.filter((path) => path !== 'audits/example.md'),
		...REQUIRED_FILE_ASSETS.filter((path) => path !== 'THIRD-PARTY-LICENSES.md'),
		'licenses/distributed-materials.json',
	];
	const sourcePaths = [
		...catalogPaths,
		...REQUIRED_FILE_ASSETS,
		'THIRD-PARTY-NOTICES.md',
		'frontend/dist/index.html',
	];
	for (const path of sourcePaths) {
		await mkdir(join(root, path, '..'), { recursive: true });
		await writeFile(join(root, path), `${path}\n`);
	}
	await mkdir(join(root, 'licenses'), { recursive: true });
	await writeFile(
		join(root, 'licenses', 'distributed-materials.json'),
		`${JSON.stringify(value, null, '\t')}\n`
	);
	return { catalogPaths, value };
}

async function issuesFor(
	value: DistributedMaterialsRegistry,
	distributedPaths = PATHS,
	existingPaths = PATHS
): Promise<string[]> {
	const existing = new Set(existingPaths);
	return await validateDistributedMaterialsRegistry(value, {
		distributedPaths,
		fileExists: async (path) => existing.has(path),
		packagedSurfaces: expectedPackagedTrackedSurfaces(),
	});
}

describe('distributed materials registry', () => {
	test('accepts complete exact-path provenance', async () => {
		expect(await issuesFor(registry())).toEqual([]);
	});

	test('rejects malformed records while parsing', () => {
		const value = structuredClone(registry()) as unknown as Record<string, unknown>;
		const classifications = value.classifications as Record<string, unknown>;
		classifications.thirdParty = [{ id: 'broken' }];
		expect(() => parseDistributedMaterialsRegistry(value)).toThrow(
			/classifications\.thirdParty\[0\]\.coveredPaths/
		);
	});

	test('rejects unsupported distribution surfaces while parsing', () => {
		const value = structuredClone(registry()) as unknown as Record<string, unknown>;
		const classifications = value.classifications as Record<string, unknown>;
		const records = classifications.thirdParty as Record<string, unknown>[];
		if (!records[0]) throw new Error('fixture record missing');
		records[0].distributionSurfaces = ['source-tree', 'contaner-image'];
		expect(() => parseDistributedMaterialsRegistry(value)).toThrow(/unsupported surface/);
	});

	test('rejects missing source pins', async () => {
		const value = registry();
		delete value.classifications.thirdParty[0]?.sourceRevision;
		expect(await issuesFor(value)).toContain(
			'third-party record example-audit must declare sourceRevision or sourceVersion.'
		);
	});

	test('rejects missing notice text', () => {
		const value = structuredClone(registry()) as unknown as Record<string, unknown>;
		const classifications = value.classifications as Record<string, unknown>;
		const records = classifications.thirdParty as Record<string, unknown>[];
		if (!records[0]) throw new Error('fixture record missing');
		records[0].noticeText = '';
		expect(() => parseDistributedMaterialsRegistry(value)).toThrow(/noticeText/);
	});

	test('rejects floating source URLs', async () => {
		const value = registry();
		const record = value.classifications.thirdParty[0];
		if (!record) throw new Error('fixture record missing');
		record.sourceUrl = 'https://github.com/example/project/blob/main/source.md';
		expect((await issuesFor(value)).join('\n')).toContain('sourceUrl is floating');
	});

	test('rejects unknown license expressions', async () => {
		const value = registry();
		const record = value.classifications.thirdParty[0];
		if (!record) throw new Error('fixture record missing');
		record.licenseExpression = 'LicenseRef-Unknown';
		expect((await issuesFor(value)).join('\n')).toContain('unknown license expression');
	});

	test('rejects duplicate path ownership', async () => {
		const value = registry();
		value.classifications.firstParty.push('audits/example.md');
		expect(await issuesFor(value)).toContain(
			'Distributed path has duplicate ownership: audits/example.md'
		);
	});

	test('rejects tracked-surface drift from packaging', async () => {
		const value = registry();
		value.trackedSurfaces.catalogRoots = value.trackedSurfaces.catalogRoots.filter(
			(path) => path !== 'audits'
		);
		expect((await issuesFor(value)).join('\n')).toContain(
			'trackedSurfaces.catalogRoots is missing packaged path: audits'
		);
	});

	test('rejects missing required notice files', async () => {
		const existing = PATHS.filter((path) => path !== 'THIRD-PARTY-NOTICES.md');
		expect((await issuesFor(registry(), PATHS, existing)).join('\n')).toContain(
			'Required notice file is missing for example-audit: THIRD-PARTY-NOTICES.md'
		);
	});

	test('rejects removed registered paths', async () => {
		const existing = PATHS.filter((path) => path !== 'audits/example.md');
		expect(await issuesFor(registry(), PATHS, existing)).toContain(
			'Registered path is missing: audits/example.md'
		);
	});

	test('rejects newly added unclassified paths', async () => {
		const paths = [...PATHS, 'audits/new.md'];
		expect(await issuesFor(registry(), paths, paths)).toContain(
			'Distributed path is unclassified: audits/new.md'
		);
	});

	test('tracked copying excludes untracked files from recursive catalog roots', async () => {
		const root = await testTempDir('aidd-distributed-paths-');
		try {
			await mkdir(join(root, 'audits'), { recursive: true });
			await writeFile(join(root, 'audits', 'tracked.md'), '# Tracked\n');
			await writeFile(join(root, 'audits', 'deleted.md'), '# Deleted\n');
			await runGit(root, 'init', '--quiet');
			await runGit(root, 'config', 'user.email', 'test@example.invalid');
			await runGit(root, 'config', 'user.name', 'Test');
			await runGit(root, 'add', 'audits/tracked.md', 'audits/deleted.md');
			await runGit(root, 'commit', '--quiet', '-m', 'fixture');
			await rm(join(root, 'audits', 'deleted.md'));
			await writeFile(join(root, 'audits', 'untracked.md'), '# Untracked\n');
			const out = join(root, 'out');
			await copyTrackedFiles(root, out, ['audits']);
			expect(await Bun.file(join(out, 'audits', 'tracked.md')).exists()).toBe(true);
			expect(await Bun.file(join(out, 'audits', 'deleted.md')).exists()).toBe(false);
			expect(await Bun.file(join(out, 'audits', 'untracked.md')).exists()).toBe(false);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('standalone copying uses the registry without a Git worktree', async () => {
		const root = await testTempDir('aidd-registered-distribution-');
		try {
			const { catalogPaths } = await writeStandaloneFixture(root);
			const out = join(root, 'out');
			await copyAssets(root, out);
			for (const path of [
				...catalogPaths,
				...REQUIRED_FILE_ASSETS,
				'frontend/dist/index.html',
			]) {
				expect(await Bun.file(join(out, path)).exists()).toBe(true);
			}
			expect(await Bun.file(join(root, '.git')).exists()).toBe(false);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('standalone copying rejects missing and unsafe registered paths', async () => {
		const root = await testTempDir('aidd-registered-distribution-invalid-');
		try {
			const { value } = await writeStandaloneFixture(root);
			await rm(join(root, 'skills', 'example.txt'));
			await expect(copyAssets(root, join(root, 'missing-out'))).rejects.toThrow(
				'Registered distribution file is missing or not a file: skills/example.txt'
			);
			value.classifications.firstParty.push('../outside.txt');
			await writeFile(
				join(root, 'licenses', 'distributed-materials.json'),
				`${JSON.stringify(value, null, '\t')}\n`
			);
			await expect(copyAssets(root, join(root, 'unsafe-out'))).rejects.toThrow(
				'Distributed surface path is not repository-relative: ../outside.txt'
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('renders attribution and required license text', () => {
		const materials = registry().classifications.thirdParty;
		const summary = renderRegistrySummary(materials);
		const notices = renderRegistryNotices(materials);
		expect(summary).toContain('audits/example.md');
		expect(summary).toContain(REVISION);
		expect(notices).toContain('aidd adapts the example material.');
		expect(notices).toContain('Compared every upstream rule; the local audit was aligned.');
		expect(notices).toContain('Permission is hereby granted');
	});

	test('CC BY notices link both the deed and legal code', () => {
		const record = material();
		record.licenseExpression = 'CC-BY-4.0';
		const notices = renderRegistryNotices([record]);
		expect(notices).toContain('https://creativecommons.org/licenses/by/4.0/');
		expect(notices).toContain('https://creativecommons.org/licenses/by/4.0/legalcode');
	});
});
