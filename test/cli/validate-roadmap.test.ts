import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { evaluateFeatureValidation } from '../../shared/src/metadata/store/validation.ts';
import { testTempDir } from '../_helpers/temp.ts';

const cliEntry = resolve(import.meta.dir, '../../cli/src/index.ts');

describe('--check-features roadmap validation', () => {
	for (const scenario of [
		{ name: 'missing roadmap', raw: null, exit: 0 },
		{
			name: 'keyed milestone object',
			raw: JSON.stringify({
				features: { 'feature-core': { milestone: 'v1.0' } },
				milestones: { 'v1.0': { priority: 1 } },
			}),
			exit: 0,
		},
		{ name: 'array milestones', raw: '{"milestones":[]}', exit: 7 },
		{ name: 'invalid JSON', raw: '{"milestones":', exit: 7 },
	]) {
		test(
			scenario.name,
			async () => {
				const dir = await testTempDir('aidd-validate-roadmap-');
				const featurePath = join(dir, '.aidd/features/feature-core/feature.json');
				await mkdir(join(dir, '.aidd/features/feature-core'), { recursive: true });
				const feature = JSON.stringify({
					id: 'feature-core',
					passes: false,
					status: 'backlog',
				});
				await writeFile(featurePath, feature);
				const roadmapPath = join(dir, '.aidd/roadmap.json');
				if (scenario.raw !== null) await writeFile(roadmapPath, scenario.raw);
				const child = Bun.spawn(
					[process.execPath, cliEntry, '--project-dir', dir, '--check-features'],
					{
						stderr: 'pipe',
						stdout: 'pipe',
						windowsHide: true,
					},
				);
				const [stdout, stderr, exit] = await Promise.all([
					new Response(child.stdout).text(),
					new Response(child.stderr).text(),
					child.exited,
				]);
				expect(exit).toBe(scenario.exit);
				if (scenario.exit !== 0) {
					expect(stdout + stderr).toContain('roadmap.json');
					expect(stdout + stderr).toContain(
						scenario.name === 'array milestones' ? 'milestones' : 'Invalid JSON',
					);
				}
				expect(await readFile(featurePath, 'utf8')).toBe(feature);
				if (scenario.raw !== null)
					expect(await readFile(roadmapPath, 'utf8')).toBe(scenario.raw);
			},
			30_000,
		);
	}

	test('a read failure is a validation issue, not an absent roadmap', async () => {
		const result = await evaluateFeatureValidation([], () => {
			throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
		});
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual([
			{
				id: 'roadmap.json',
				message: 'roadmap.json could not be read: Permission denied',
				path: '.aidd/roadmap.json',
			},
		]);
	});
});
