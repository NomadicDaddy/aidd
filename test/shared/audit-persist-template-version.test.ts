import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { FileAiddStore } from '../../shared/src/metadata/store.ts';
import { persistAuditReports } from '../../shared/src/modes/audit-persist.ts';
import { testTempRoot } from '../_helpers/temp.ts';

const rootDir = join(testTempRoot, 'audit-persist-template-version');

afterEach(async () => {
	await removeTempTree(rootDir);
});

async function persistOneFinding(projectDir: string): Promise<Record<string, unknown>> {
	const store = new FileAiddStore(projectDir);
	await persistAuditReports({
		projectDir,
		runId: 'run-template',
		selectedAudits: ['ARCHITECTURE'],
		simulated: false,
		store,
		structured: {
			auditFindings: [
				{
					affectedFiles: ['backend/src/app.ts'],
					description: 'Verified: backend/src/app.ts:12 - example finding',
					id: 'audit-architecture-example',
					severity: 'Medium',
					spec: 'Fix the example.',
					title: 'Example finding',
				},
			],
			reportMarkdown: '# ARCHITECTURE Audit Report\n\nOne finding.\n',
		},
	});
	const [feature] = await store.listFeatures({ includeAudit: true });
	if (!feature) throw new Error('Expected the finding to be filed as a feature record');
	return feature as Record<string, unknown>;
}

// An audit of the Spernakit template filed 26 findings with no `spernakit_version`. The template
// requires that field on every feature record it holds, so its own gate went red for everyone
// working there, on files git could not even show because `.aidd/` is ignored in that repository.
describe('audit findings filed into the template repository', () => {
	test('carry the template version the repository declares', async () => {
		const projectDir = join(rootDir, 'spernakit');
		await mkdir(join(projectDir, 'scripts'), { recursive: true });
		await writeFile(join(projectDir, 'scripts', 'init.ts'), '// the template generator\n');
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'spernakit', version: '3.47.4' }),
		);

		const feature = await persistOneFinding(projectDir);

		expect(feature['spernakit_version']).toBe('3.47.4');
	});

	test('carry no template version in any other project', async () => {
		const projectDir = join(rootDir, 'some-app');
		await mkdir(projectDir, { recursive: true });
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'some-app', spernakit_version: '3.47.4', version: '1.2.0' }),
		);

		const feature = await persistOneFinding(projectDir);

		expect('spernakit_version' in feature).toBe(false);
	});
});
