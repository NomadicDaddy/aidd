import { readBlueprintSetupContext } from 'aidd-shared/metadata/blueprint';
import { describeMissingSetup } from 'aidd-shared/metadata/blueprint-setup';
import {
	detectInitialPhase,
	listMissingOnboardingArtifacts,
} from 'aidd-shared/metadata/onboarding';
import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';

async function writeFeature(projectDir: string, id: string): Promise<void> {
	await mkdir(join(projectDir, '.aidd', 'features', id), { recursive: true });
	await Bun.write(
		join(projectDir, '.aidd', 'features', id, 'feature.json'),
		JSON.stringify({ id, passes: true, priority: 1, status: 'completed', title: id }),
	);
}

/** The reported project: an existing CLI codebase with a backlog and roadmap but no onboarding. */
async function summonLikeProject(): Promise<string> {
	const projectDir = await testTempDir('aidd-blueprint-setup-');
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await Bun.write(join(projectDir, 'src', 'index.ts'), 'export const app = 1;\n');
	await writeFeature(projectDir, 'shipped-feature');
	await Bun.write(
		join(projectDir, '.aidd', 'roadmap.json'),
		JSON.stringify({ features: {}, milestones: { MVP: { priority: 1 } } }),
	);
	return projectDir;
}

describe('onboarding artifacts and the setup context read from them', () => {
	test('names the artifacts the reported project was actually missing', async () => {
		const projectDir = await summonLikeProject();

		expect(await listMissingOnboardingArtifacts(projectDir)).toEqual([
			'.aidd/spec.md',
			'.aidd/CHANGELOG.md',
		]);
		expect(await detectInitialPhase(projectDir)).toBe('onboarding');
	});

	// One read behind both answers: a second implementation could describe a project the phase
	// check had already moved past, which is how a stale explanation outlives its cause.
	test('agrees with the phase check once every artifact exists', async () => {
		const projectDir = await summonLikeProject();
		await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
		await Bun.write(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');

		expect(await listMissingOnboardingArtifacts(projectDir)).toEqual([]);
		expect(await detectInitialPhase(projectDir)).toBe('coding');
	});

	test('counts an empty backlog as a missing product feature', async () => {
		const projectDir = await testTempDir('aidd-blueprint-setup-empty-');
		await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });

		expect(await listMissingOnboardingArtifacts(projectDir)).toEqual([
			'a product feature in .aidd/features',
			'.aidd/spec.md',
			'.aidd/CHANGELOG.md',
		]);
	});

	test('reads an idle context when the caller supplies no activity', async () => {
		const projectDir = await summonLikeProject();
		const context = await readBlueprintSetupContext(projectDir);

		expect(context.activity).toBeNull();
		expect(context.missingArtifacts).toEqual(['.aidd/spec.md', '.aidd/CHANGELOG.md']);
	});

	test('carries the activity the caller found through unchanged', async () => {
		const projectDir = await summonLikeProject();
		const context = await readBlueprintSetupContext(projectDir, {
			kind: 'run',
			label: 'The coding run',
			lifecycle: 'running',
			reference: 'run_9',
		});

		expect(context.activity?.reference).toBe('run_9');
	});

	test('describes missing artifacts in a sentence, and says so when none are known', () => {
		expect(describeMissingSetup([])).toBe(
			'Project setup is incomplete and no setup work is running.',
		);
		expect(describeMissingSetup(['.aidd/spec.md'])).toBe(
			'Project setup is incomplete: .aidd/spec.md is missing.',
		);
		expect(describeMissingSetup(['a', 'b', 'c'])).toBe(
			'Project setup is incomplete: a, b and c are missing.',
		);
	});
});
