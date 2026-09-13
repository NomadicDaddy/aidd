import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copySkillContracts } from '../../cli/src/metadata/scaffoldSkillContracts.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { compilePrompt } from '../../cli/src/prompts/compile.ts';
import { parseArgs } from '../../shared/src/args/index.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { compileSkillDirective, readSkillDefinition } from '../../shared/src/skills/catalog.ts';
import { testTempDir } from '../_helpers/temp.ts';

const rootDir = join(import.meta.dir, '..', '..');
const tempDir = await testTempDir('skill-selection');
const config = {
	cli: 'native' as const,
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 1,
	noClean: false,
	noWorkBackoffMs: 30_000,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low' as const,
	timeoutSeconds: 3600,
};

afterAll(async () => {
	await removeTempTree(tempDir);
});

describe('skill source and scoped replacement contracts', () => {
	for (const backend of [
		'native',
		'claude-code',
		'codex',
		'cline',
		'opencode',
		'kilocode',
		'grok',
	]) {
		for (const namedSkill of [false, true]) {
			test(`${backend} receives selection rules for ${namedSkill ? 'a named skill' : 'a prose directive'}`, async () => {
				const directive = namedSkill
					? compileSkillDirective(
							await readSkillDefinition(rootDir, 'refresh-project-artifacts'),
							'example',
						)
					: 'Reconcile project artifacts using the documented workflows.';
				const plan = resolveRunPlan(
					parseArgs(['--project-dir', tempDir, '--cli', backend, '--prompt', directive]),
					config,
				);
				const compiled = await compilePrompt(plan.prompt, {
					rootDir,
					includeProjectContext: false,
				});
				const policy = await readFile(
					join(rootDir, 'prompts/_common/skill-selection.md'),
					'utf8',
				);
				expect(compiled.text).toContain(policy.trim());
				expect(compiled.text).toContain('disable-model-invocation: true');
				expect(compiled.text).toContain('directiveCompleted":false');
				expect(compiled.text).toContain('every required deliverable and applicable check');
			});
		}
	}

	test('the staged context replacement includes domain checks and a bounded decision procedure', async () => {
		const target = join(tempDir, 'context', '.aidd');
		await copySkillContracts(
			{
				contracts: [],
				references: ['docs/reference/external-skills.md'],
				spernakitReferences: [],
			},
			rootDir,
			target,
			undefined,
			undefined,
		);
		const source = await readFile(join(rootDir, 'docs/reference/external-skills.md'), 'utf8');
		const staged = await readFile(join(target, 'docs/reference/external-skills.md'), 'utf8');
		expect(staged).toBe(source);
		for (const requirement of [
			'CONTEXT-MAP.md',
			'domain glossary',
			'rejected synonyms',
			'Code shows current behavior',
			'mark that artifact blocked',
			'not an equivalent substitute',
		]) {
			expect(staged).toContain(requirement);
		}
	});

	test('the design replacement covers current review concerns without claiming an upstream build', async () => {
		const skill = await readSkillDefinition(rootDir, 'ui-redesign-planner');
		for (const requirement of [
			'41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f',
			'Subject and brief',
			'Design direction',
			'Default-pattern review',
			'Product language',
			'Critique and evidence',
			'invocation-restricted',
			'current Phase 2 criteria',
			'record the coverage gaps',
			'not upstream UI implementation',
			'The exact Phase 2 source, selection reason, covered scope, omissions, and evidence limitations.',
		]) {
			expect(skill.body).toContain(requirement);
		}
		expect(skill.body).not.toContain('do not report\nreduced confidence');
	});

	test('a stale staged copy cannot conceal a missing or empty source contract', async () => {
		const sourceRoot = join(tempDir, 'missing-source');
		const target = join(tempDir, 'stale', '.aidd');
		const deps = { contracts: ['required-review'], references: [], spernakitReferences: [] };
		const source = join(sourceRoot, 'skills', 'required-review');
		await mkdir(join(target, 'skills', 'required-review'), { recursive: true });
		await writeFile(join(target, 'skills', 'required-review', 'SKILL.md'), 'Old procedure');
		await expect(
			copySkillContracts(deps, sourceRoot, target, undefined, undefined),
		).rejects.toThrow("Required skill contract 'required-review' not found");
		await mkdir(source, { recursive: true });
		await expect(
			copySkillContracts(deps, sourceRoot, target, undefined, undefined),
		).rejects.toThrow('ENOENT');
		await writeFile(join(source, 'SKILL.md'), '   ');
		await expect(
			copySkillContracts(deps, sourceRoot, target, undefined, undefined),
		).rejects.toThrow("Required skill contract 'required-review' is empty");
	});
});
