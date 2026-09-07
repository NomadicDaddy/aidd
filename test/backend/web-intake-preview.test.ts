import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { getIntakePreview } from '../../backend/src/services/project/intakePreview.ts';
import { manifestEntryVersion } from '../../shared/src/metadata/project-stack.ts';

import { testTempDir } from '../_helpers/temp.ts';
function previewConfig(allowedRoot: string, manifestPath: null | string = null) {
	return {
		config: {
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
			hostname: '127.0.0.1',
			ignoredFolders: ['.git', 'node_modules'],
			maxConcurrentRuns: 2,
			maxConcurrentRunsPerProject: 2,
			autoChainLimit: 3,
			autoChainRuns: false,
			useWorktrees: false,
			port: 3210,
			spernakitFleetManifest: manifestPath,
			spernakitInitScript: null,
			spernakitTemplateRef: null,
			showSpernakitProject: false,
			spernakitTemplateRepo: 'NomadicDaddy/spernakit',
			templates: [],
			traceDataMovement: false,
		},
	};
}

const MANIFEST = `@{
	ExpectedConfigs = @{
		'taskboard' = @{
			frontendPort      = 3340
			version           = '0.11.4'
			spernakit_version = '3.8.0'
		}
		'pendingapp' = @{
			spernakit_version = 'latest'
		}
		'spernakit' = @{
			version = '3.8.0'
		}
	}
}
`;

describe('intake preview', () => {
	test('manifestEntryVersion extracts per-slug spernakit_version', () => {
		expect(manifestEntryVersion(MANIFEST, 'taskboard')).toBe('3.8.0');
		expect(manifestEntryVersion(MANIFEST, 'pendingapp')).toBe('latest');
		expect(manifestEntryVersion(MANIFEST, 'spernakit')).toBe('');
		expect(manifestEntryVersion(MANIFEST, 'unknown-app')).toBeNull();
	});

	test('previews a plain Bun/TypeScript project with structured stack data and no git', async () => {
		const root = await testTempDir('aidd-intake-preview-');
		const project = join(root, 'taskboard');
		await mkdir(project, { recursive: true });
		await writeFile(
			join(project, 'package.json'),
			JSON.stringify({
				dependencies: { elysia: '1.0.0', react: '19.0.0' },
				engines: { bun: '>=1.0.0' },
				name: 'taskboard',
			}),
			'utf8',
		);
		await writeFile(join(project, 'tsconfig.json'), '{}', 'utf8');
		const manifestPath = join(root, 'spernakit.psd1');
		await writeFile(manifestPath, MANIFEST, 'utf8');

		const preview = await getIntakePreview(previewConfig(root, manifestPath), project);

		expect(preview.name).toBe('taskboard');
		expect(preview.hasAidd).toBe(false);
		expect(preview.git).toBeNull();
		expect(preview.stack).toMatchObject({
			family: 'spernakit',
			frameworks: expect.arrayContaining(['Elysia', 'React']),
			languages: ['TypeScript'],
			runtimes: ['Bun'],
			source: 'fleet-manifest',
		});
		expect(preview.spernakit).toEqual({
			fileSignals: false,
			inManifest: true,
			manifestVersion: '3.8.0',
		});
		expect(preview.workspaceRoot.detected).toBe(false);
	});

	test('detects workspace roots', async () => {
		const root = await testTempDir('aidd-intake-workspace-');
		const umbrella = join(root, 'umbrella');
		await mkdir(join(umbrella, 'app-one'), { recursive: true });
		await mkdir(join(umbrella, 'app-two'), { recursive: true });
		await writeFile(join(umbrella, 'package.json'), '{"name":"umbrella"}', 'utf8');
		await writeFile(join(umbrella, 'app-one', 'package.json'), '{"name":"one"}', 'utf8');
		await writeFile(join(umbrella, 'app-two', 'package.json'), '{"name":"two"}', 'utf8');

		const preview = await getIntakePreview(previewConfig(root), umbrella);

		expect(preview.workspaceRoot).toEqual({ detected: true, subprojectCount: 2 });
	});
});
