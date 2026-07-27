import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RecipeConfigValue } from '../../backend/src/types.ts';

import {
	composeStepPrompt,
	requestFromAiddCliStep,
} from '../../backend/src/services/pipeline/helpers.ts';

const recipesDir = join(import.meta.dir, '..', '..', 'recipes');

interface RecipeFile {
	steps?: { configJson?: Record<string, RecipeConfigValue>; name?: string }[];
}

function step(config: Record<string, RecipeConfigValue>) {
	return requestFromAiddCliStep({
		config,
		pipelineSessionId: 'pipe_test',
		priorStepOutput: { stepName: 'Spirit review', text: 'FINDING: the guard is unreachable.' },
		projectDir: '/tmp/project',
	});
}

describe('prior step output forwarding', () => {
	// The bug this closes: a remediation step is a fresh CLI process whose prompt is built from
	// recipe config alone, so a recipe telling it to act on "the immediately preceding findings"
	// handed it nothing and it had to rediscover them.
	test('appends the preceding step output when the step opts in', () => {
		const request = step({ includePriorStepOutput: true, prompt: 'Remediate the findings.' });
		expect(request.prompt).toContain('Remediate the findings.');
		expect(request.prompt).toContain('Spirit review');
		expect(request.prompt).toContain('FINDING: the guard is unreachable.');
		expect(request.mode).toBe('directive');
	});

	test('leaves the prompt untouched without the opt-in', () => {
		const request = step({ prompt: 'Remediate the findings.' });
		expect(request.prompt).toBe('Remediate the findings.');
	});

	test('an opted-in step with no preceding output keeps its prompt verbatim', () => {
		const request = requestFromAiddCliStep({
			config: { includePriorStepOutput: true, prompt: 'Remediate the findings.' },
			pipelineSessionId: 'pipe_test',
			projectDir: '/tmp/project',
		});
		expect(request.prompt).toBe('Remediate the findings.');
	});

	// The forwarded text is untrusted agent output; it must land as labelled input rather than be
	// spliced into the instruction, and the composed prompt must stay well inside the argv limit.
	test('labels the forwarded findings and keeps the instruction first', () => {
		const composed = composeStepPrompt('Do the work.', {
			stepName: 'Deep review',
			text: 'body',
		});
		expect(composed.startsWith('Do the work.')).toBe(true);
		expect(composed).toContain('## Findings from the preceding pipeline step ("Deep review")');
		expect(composed.indexOf('body')).toBeGreaterThan(composed.indexOf('Do the work.'));
	});

	// The wiring is only useful if the recipes that promise it actually opt in. A recipe step whose
	// prompt claims to act on "the immediately preceding" findings but omits the flag silently
	// regresses to the original bug, so pin the two together.
	test('every recipe step that promises preceding findings opts in', async () => {
		const files = (await readdir(recipesDir)).filter((name) => name.endsWith('.json'));
		const offenders: string[] = [];
		let promising = 0;
		for (const file of files) {
			const recipe = JSON.parse(await readFile(join(recipesDir, file), 'utf8')) as RecipeFile;
			for (const recipeStep of recipe.steps ?? []) {
				const prompt = recipeStep.configJson?.prompt;
				if (typeof prompt !== 'string' || !prompt.includes('immediately preceding'))
					continue;
				promising++;
				if (recipeStep.configJson?.includePriorStepOutput !== true) {
					offenders.push(`${file}: ${recipeStep.name ?? '(unnamed)'}`);
				}
			}
		}
		expect(offenders).toEqual([]);
		expect(promising).toBeGreaterThan(0);
	});
});
