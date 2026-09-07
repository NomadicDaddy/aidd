import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RecipeConfigValue } from '../../backend/src/types.ts';

import {
	composeStepPrompt,
	formatForwardedAgentMessage,
	requestFromAiddCliStep,
} from '../../backend/src/services/pipeline/helpers.ts';
import { RunWaiter } from '../../backend/src/services/pipeline/runWaiter.ts';

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

	// What a managed step actually leaves behind: a transcript of NDJSON envelopes. Forwarding a
	// byte-aligned tail of that handed the remediation step a fragment starting mid-line, so the
	// findings it was told to act on arrived as broken JSON. The message is what must cross over.
	test('forwards the closing agent message, not the raw transcript', async () => {
		const transcript = [
			'{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Reading the guard."}]}}',
			'{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]}}',
			'{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"## Review\\n\\nFINDING: the guard is unreachable."}]}}',
		].join('\n');
		const waiter = new RunWaiter({
			runService: {
				readOutput: async () => ({ output: transcript }),
			} as unknown as ConstructorParameters<typeof RunWaiter>[0]['runService'],
			stopFlags: new Set<string>(),
		});
		const message = await waiter.agentMessageForRun('run_1');
		expect(message).toBe('## Review\n\nFINDING: the guard is unreachable.');
		expect(message).not.toContain('tool_result');
		expect(message).not.toContain('"type":"assistant"');
	});

	test('an unreadable transcript forwards nothing rather than throwing', async () => {
		const waiter = new RunWaiter({
			runService: {
				readOutput: async () => {
					throw new Error('log missing');
				},
			} as unknown as ConstructorParameters<typeof RunWaiter>[0]['runService'],
			stopFlags: new Set<string>(),
		});
		expect(await waiter.agentMessageForRun('run_1')).toBeUndefined();
	});

	// Opposite of formatOutputSummary's tail-keeping: a report leads with its findings, so an
	// oversized message must keep its head, and the cut has to be announced rather than silent.
	test('an oversized message keeps its head and announces the cut', () => {
		const forwarded = formatForwardedAgentMessage(`FINDING ONE${'x'.repeat(20000)}`);
		expect(forwarded?.startsWith('FINDING ONE')).toBe(true);
		expect(forwarded).toContain('truncated');
		expect(forwarded?.length).toBeLessThan(20011);
	});

	test('an empty or absent message forwards nothing', () => {
		expect(formatForwardedAgentMessage(undefined)).toBeUndefined();
		expect(formatForwardedAgentMessage('   \n ')).toBeUndefined();
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
