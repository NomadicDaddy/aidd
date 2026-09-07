import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderStep(submitAttempted: boolean): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { RecipeStepEditor } from './src/pages/recipes/RecipeStepEditor.tsx';",
		"import { collectStepErrors, newStepDraft } from './src/pages/recipes/recipe-steps.ts';",
		'const step = newStepDraft();',
		'const errors = collectStepErrors(step);',
		`const editor = createElement(RecipeStepEditor, { errors, expanded: true, index: 0, onChange: () => {}, onDelete: () => {}, onMoveDown: () => {}, onMoveUp: () => {}, onToggle: () => {}, showAllErrors: ${String(submitAttempted)}, step, total: 1 });`,
		'console.log(renderToStaticMarkup(editor));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('recipe step name validation timing', () => {
	test('an untouched new step renders required but not invalid', () => {
		const html = renderStep(false);

		expect(html).toContain('aria-required="true"');
		expect(html).not.toContain('aria-invalid="true"');
		expect(html).not.toContain('role="alert"');
		expect(html).not.toContain('Step name is required');
	});

	test('a submit attempt renders the border and alert from the same error', () => {
		const html = renderStep(true);

		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('role="alert"');
		expect(html).toContain('Step name is required');
	});
});
