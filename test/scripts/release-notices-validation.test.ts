import { describe, expect, test } from 'bun:test';

import { ALL_TARGETS } from '../../scripts/build-standalone.ts';
import {
	normalizeArchivePath,
	type ReleaseArchive,
} from '../../scripts/lib/release-notices/archive.ts';
import {
	archiveName,
	stageName,
	validateReleaseArchive,
	validateReleaseDirectory,
} from '../../scripts/lib/release-notices/validation.ts';
import {
	renderSourceManifest,
	type SourceRevisions,
} from '../../scripts/lib/release/source-manifest.ts';

const TARGET = ALL_TARGETS.find((target) => target.name === 'bun-windows-x64-modern');
if (TARGET === undefined) throw new Error('Missing Windows standalone target');

const REVISIONS: SourceRevisions = {
	aiddCommit: 'a'.repeat(40),
	aiddVersion: '2.130.1',
	bunTag: 'bun-v1.3.14',
	bunVersion: '1.3.14',
	lockfileSha256: 'b'.repeat(64),
};

function archive(files: Record<string, string>): ReleaseArchive {
	return {
		entries: Object.keys(files).map((path) => ({ isDirectory: false, path })),
		readText: async (path) => files[path] ?? '',
	};
}

describe('release archive identity', () => {
	test('requires exactly the current ZIP and staging directory', () => {
		const issues = validateReleaseDirectory(
			[
				{ isDirectory: true, isFile: false, name: stageName('2.130.1', TARGET) },
				{ isDirectory: false, isFile: true, name: archiveName('2.130.1', TARGET) },
			],
			'2.130.1',
			[TARGET]
		);
		expect(issues).toEqual([]);
	});

	test('rejects stale ZIPs and staging directories', () => {
		const issues = validateReleaseDirectory(
			[
				{ isDirectory: true, isFile: false, name: 'aidd-v2.129.0-bun-windows-x64-modern' },
				{
					isDirectory: false,
					isFile: true,
					name: 'aidd-v2.129.0-bun-windows-x64-modern.zip',
				},
			],
			'2.130.1',
			[TARGET]
		);
		expect(issues).toHaveLength(2);
	});

	test('rejects unsafe archive paths', () => {
		expect(() => normalizeArchivePath('../LICENSE')).toThrow(/Unsafe archive entry/);
		expect(() => normalizeArchivePath('C:\\release\\LICENSE')).toThrow(/Unsafe archive entry/);
	});
});

describe('release archive contents', () => {
	test('accepts exact catalog, notice, and source-manifest content', async () => {
		const stage = stageName('2.130.1', TARGET);
		const files = {
			[`${stage}/audits/CURRENT.md`]: 'audit',
			[`${stage}/LICENSE`]: 'license',
			[`${stage}/licenses/SOURCE-MANIFEST.md`]: renderSourceManifest(REVISIONS),
		};
		const issues = await validateReleaseArchive({
			archive: archive(files),
			catalogPaths: ['audits/CURRENT.md'],
			requiredPaths: ['LICENSE', 'licenses/SOURCE-MANIFEST.md'],
			revisions: REVISIONS,
			stage,
		});
		expect(issues).toEqual([]);
	});

	test('rejects wrong root, missing and extra catalog files, and stale manifest', async () => {
		const stage = stageName('2.130.1', TARGET);
		const files = {
			['wrong-root/audits/EXTRA.md']: 'extra',
			[`${stage}/audits/EXTRA.md`]: 'extra',
			[`${stage}/licenses/SOURCE-MANIFEST.md`]: 'stale',
		};
		const issues = await validateReleaseArchive({
			archive: archive(files),
			catalogPaths: ['audits/CURRENT.md'],
			requiredPaths: ['LICENSE', 'licenses/SOURCE-MANIFEST.md'],
			revisions: REVISIONS,
			stage,
		});
		expect(issues.join('\n')).toContain('outside');
		expect(issues.join('\n')).toContain('missing required archive file: LICENSE');
		expect(issues.join('\n')).toContain('missing catalog file: audits/CURRENT.md');
		expect(issues.join('\n')).toContain('unexpected catalog file: audits/EXTRA.md');
		expect(issues.join('\n')).toContain('does not match the current source revisions');
	});

	test('rejects an empty second root directory', async () => {
		const stage = stageName('2.130.1', TARGET);
		const candidate = archive({ [`${stage}/licenses/SOURCE-MANIFEST.md`]: 'stale' });
		candidate.entries.push({ isDirectory: true, path: 'second-root' });
		const issues = await validateReleaseArchive({
			archive: candidate,
			catalogPaths: [],
			requiredPaths: [],
			revisions: REVISIONS,
			stage,
		});
		expect(issues.join('\n')).toContain('archive entries outside');
	});

	test('rejects retired vendor paths even when catalog expectations are compromised', async () => {
		const stage = stageName('2.130.1', TARGET);
		const path = 'skills/frontend-design/SKILL.md';
		const issues = await validateReleaseArchive({
			archive: archive({ [`${stage}/${path}`]: 'vendor copy' }),
			catalogPaths: [path],
			requiredPaths: [],
			revisions: REVISIONS,
			stage,
		});
		expect(issues).toContain(`retired catalog path is present: ${path}`);
	});
});
