import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { disabledFieldSurfaceClass, fieldHintClass } from '../../frontend/src/lib/formStyles.ts';
import { compactFieldMeasureClass, proseMeasureClass } from '../../frontend/src/lib/typography.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderFieldContract(): {
	checkboxes: Record<string, string>;
	field: string;
} {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FieldCheckbox, FieldRow } from './src/components/ui/field.tsx';",
		"const checkbox = (checked, disabled) => renderToStaticMarkup(createElement(FieldCheckbox, { checked, description: 'Long operational explanation.', disabled, label: 'Consent' }));",
		"const field = renderToStaticMarkup(createElement(FieldRow, { error: 'Required', hint: 'Long field guidance.', label: 'Project' }, createElement('input')));",
		'console.log(JSON.stringify({ checkboxes: { disabledChecked: checkbox(true, true), disabledUnchecked: checkbox(false, true), enabledChecked: checkbox(true, false), enabledUnchecked: checkbox(false, false) }, field }));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as {
		checkboxes: Record<string, string>;
		field: string;
	};
}

describe('shared field-control contract', () => {
	test('keeps the hint track full-width while constraining only its prose', () => {
		const { field } = renderFieldContract();
		const describedIds = field.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? [];
		const [hintId, errorId] = describedIds;

		expect(hintId).toBeTruthy();
		expect(errorId).toBeTruthy();
		expect(field).toContain(
			`<div class="${fieldHintClass}" id="${hintId}"><div class="${proseMeasureClass}">Long field guidance.</div></div>`,
		);
		expect(field.indexOf(`id="${errorId}"`)).toBeLessThan(field.indexOf(`id="${hintId}"`));
	});

	test('distinguishes enabled, disabled, checked, and unchecked checkbox states', () => {
		const { checkboxes } = renderFieldContract();

		for (const state of ['disabledChecked', 'disabledUnchecked']) {
			expect(checkboxes[state]).toContain('disabled=""');
			expect(checkboxes[state]).toContain(disabledFieldSurfaceClass);
			expect(checkboxes[state]).toContain('text-muted-foreground');
		}
		for (const state of ['enabledChecked', 'enabledUnchecked']) {
			expect(checkboxes[state]).not.toContain('disabled=""');
			expect(checkboxes[state]).not.toContain(disabledFieldSurfaceClass);
		}
		expect(checkboxes.disabledChecked).toContain('checked=""');
		expect(checkboxes.enabledChecked).toContain('checked=""');
		expect(checkboxes.disabledUnchecked).not.toContain('checked=""');
		expect(checkboxes.enabledUnchecked).not.toContain('checked=""');
	});

	test('keeps compact measures explicit and removes inert placements', async () => {
		const field = await Bun.file(resolve(FRONTEND_ROOT, 'src/components/ui/field.tsx')).text();
		const provider = await Bun.file(
			resolve(FRONTEND_ROOT, 'src/pages/settings/ProviderConfigSection.tsx'),
		).text();
		const directAi = await Bun.file(
			resolve(FRONTEND_ROOT, 'src/pages/settings/DirectAiSection.tsx'),
		).text();

		expect(compactFieldMeasureClass).toBe('max-w-[36rem]');
		expect(field).not.toContain('compactFieldMeasureClass');
		expect(provider).toContain('className={compactFieldMeasureClass} label="Default Provider"');
		expect(directAi).not.toContain('compactFieldMeasureClass');
	});
});
