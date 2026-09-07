import { describe, expect, test } from 'bun:test';

import { expectedPackagedTrackedSurfaces } from '../../scripts/lib/third-party-licenses/distributed-paths.ts';
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

const REVISION = '4559f18a20c1691c744b4395194290db6a0df5e9';
const PATHS = [
	'README.md',
	'THIRD-PARTY-LICENSES.md',
	'THIRD-PARTY-NOTICES.md',
	'audits/example.md',
	'licenses/distributed-materials.json',
];
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

async function issuesFor(
	value: DistributedMaterialsRegistry,
	distributedPaths = PATHS,
	existingPaths = PATHS,
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
			/classifications\.thirdParty\[0\]\.coveredPaths/,
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
			'third-party record example-audit must declare sourceRevision or sourceVersion.',
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
			'Distributed path has duplicate ownership: audits/example.md',
		);
	});

	test('rejects tracked-surface drift from packaging', async () => {
		const value = registry();
		value.trackedSurfaces.catalogRoots = value.trackedSurfaces.catalogRoots.filter(
			(path) => path !== 'audits',
		);
		expect((await issuesFor(value)).join('\n')).toContain(
			'trackedSurfaces.catalogRoots is missing packaged path: audits',
		);
	});

	test('rejects missing required notice files', async () => {
		const existing = PATHS.filter((path) => path !== 'THIRD-PARTY-NOTICES.md');
		expect((await issuesFor(registry(), PATHS, existing)).join('\n')).toContain(
			'Required notice file is missing for example-audit: THIRD-PARTY-NOTICES.md',
		);
	});

	test('rejects removed registered paths', async () => {
		const existing = PATHS.filter((path) => path !== 'audits/example.md');
		expect(await issuesFor(registry(), PATHS, existing)).toContain(
			'Registered path is missing: audits/example.md',
		);
	});

	test('rejects newly added unclassified paths', async () => {
		const paths = [...PATHS, 'audits/new.md'];
		expect(await issuesFor(registry(), paths, paths)).toContain(
			'Distributed path is unclassified: audits/new.md',
		);
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
