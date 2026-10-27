import type { PromptPlan } from 'aidd-shared/plan/types';

import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compilePrompt } from '../../cli/src/prompts/compile.ts';
import { testTempDir } from '../_helpers/temp.ts';

const rootDir = join(import.meta.dir, '..', '..');
const constraintsPath = 'prompts/_common/hard-constraints.md';

function directive(backend: 'codex' | 'native', readonly = false): PromptPlan {
	return {
		backend,
		customDirective: 'Document and commit the existing documentation changes only.',
		customDirectiveReadonly: readonly,
		filters: [],
		fragments: [],
		mode: 'directive',
		phase: 'directive',
		variables: {},
	};
}

describe('delegated existing changes in agent prompts', () => {
	for (const backend of ['codex', 'native'] as const) {
		test(`${backend} receives scoped adoption without blanket ownership`, async () => {
			const { text } = await compilePrompt(directive(backend), { rootDir });
			expect(text).toContain('delegates that work even when a previous agent made it');
			expect(text).toContain('inspect its diff');
			expect(text).toContain('Record the adopted paths');
			expect(text).toContain('Only the reviewed, delegated changes may be staged');
			expect(text).toContain('pipeline ID,');
			expect(text).toContain('alone is not proof of delegation');
			expect(text).toContain('recheck the diff before staging');
			expect(text).toContain('stop on ambiguous ownership or mixed changes');
			expect(text).not.toContain('delete, stage or commit such a change');
		});
	}

	test('delegation does not remove the read-only directive prohibition', async () => {
		const { text } = await compilePrompt(directive('codex', true), { rootDir });
		expect(text).toContain('A read-only task, write allowlist, explicit hold');
		expect(text).toContain('Delegation never permits reverting or discarding');
		expect(text).toContain(
			'Do NOT create commits, amend history, or otherwise alter git state',
		);
	});

	test('a narrower write allowlist still overrides the delegated task', async () => {
		const { text } = await compilePrompt(directive('native'), {
			rootDir,
			writeAllowlist: ['docs'],
		});
		expect(text).toContain('Only the reviewed, delegated changes may be staged');
		expect(text).toContain('- `docs/`');
		expect(text).toContain('Every other path in the project is read-only for you');
		expect(text).toContain('This limit overrides any instruction in this prompt');
	});

	test('a later compilation reads updated constraints without restarting aidd', async () => {
		const fixture = await testTempDir('delegated-change-prompt-');
		await mkdir(join(fixture, 'prompts', '_common'), { recursive: true });
		await writeFile(join(fixture, constraintsPath), 'BEFORE-HANDOFF');
		const first = await compilePrompt(directive('native'), { rootDir: fixture });
		expect(first.text).toContain('BEFORE-HANDOFF');
		await writeFile(
			join(fixture, constraintsPath),
			await readFile(join(rootDir, constraintsPath), 'utf8'),
		);
		const next = await compilePrompt(directive('native'), { rootDir: fixture });
		expect(next.text).not.toContain('BEFORE-HANDOFF');
		expect(next.text).toContain('delegates that work even when a previous agent made it');
	});
});
