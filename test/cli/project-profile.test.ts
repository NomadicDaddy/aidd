import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	readExplicitProjectAssuranceProfile,
	writeProjectAssuranceProfile,
} from 'aidd-shared/metadata/project-profile';
import { projectAssuranceProfileFileSchema } from '../../shared/src/contracts/project-profile.ts';

import { testTempDir } from '../_helpers/temp.ts';
describe('project profile metadata', () => {
	test('rejects non-canonical explicit profiles', async () => {
		const projectDir = await testTempDir('aidd-profile-read-');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'project-profile.json'),
			JSON.stringify({
				authMode: 'local_owner',
				bucket: 'single_user_local',
				criticality: 'utility',
				dataSensitivity: 'low',
				deployment: 'local',
				externalIntegrations: 'none',
			}),
		);

		const profile = await readExplicitProjectAssuranceProfile(projectDir);

		expect(profile).toBeNull();
	});

	test('writes canonical project-profile.json documents', async () => {
		const projectDir = await testTempDir('aidd-profile-write-');
		const profile = await writeProjectAssuranceProfile(projectDir, {
			authMode: 'tenant_rbac',
			bucket: 'public_multi_tenant',
			criticality: 'business_critical',
			dataSensitivity: 'regulated',
			deployment: 'cloud',
			externalIntegrations: 'financial_or_security',
			notes: '  Hosted customer-facing app.  ',
		});
		const written = JSON.parse(
			await readFile(join(projectDir, '.aidd', 'project-profile.json'), 'utf8'),
		) as Record<string, unknown>;

		expect(Object.keys(written).sort()).toEqual([
			'authMode',
			'bucket',
			'criticality',
			'dataSensitivity',
			'deployment',
			'externalIntegrations',
			'notes',
			'source',
			'updatedAt',
		]);
		expect(profile).toMatchObject({ notes: 'Hosted customer-facing app.', source: 'explicit' });
		for (const required of projectAssuranceProfileFileSchema.required) {
			expect(written).toHaveProperty(required);
		}
	});
});
