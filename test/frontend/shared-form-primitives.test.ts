import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { formControlClass, textareaClass } from '../../frontend/src/lib/formStyles.ts';

function renderPrimitives(): { checkbox: string; field: string } {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Checkbox } from './src/components/ui/checkbox.tsx';",
		"import { FieldRow } from './src/components/ui/field.tsx';",
		"import { Input } from './src/components/ui/input.tsx';",
		"const field = createElement(FieldRow, { label: 'Project' }, createElement(Input, { name: 'project' }));",
		"const checkbox = createElement(Checkbox, { 'aria-label': 'Enabled' });",
		'console.log(JSON.stringify({ checkbox: renderToStaticMarkup(checkbox), field: renderToStaticMarkup(field) }));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as {
		checkbox: string;
		field: string;
	};
}

describe('shared form primitives', () => {
	test('makes canonical controls fill and shrink within their field', () => {
		expect(formControlClass).toContain('w-full');
		expect(formControlClass).toContain('min-w-0');
		expect(textareaClass).toContain('w-full');
		expect(textareaClass).toContain('min-w-0');
	});

	test('renders the canonical label above its control and gives checkboxes semantic focus styling', () => {
		const { checkbox, field } = renderPrimitives();

		expect(field).toContain('<label class="grid gap-1">');
		expect(field.indexOf('Project')).toBeLessThan(field.indexOf('<input'));
		expect(field).toContain('uppercase');
		expect(checkbox).toContain('type="checkbox"');
		expect(checkbox).toContain('accent-accent');
		expect(checkbox).toContain('focus-visible:ring-2');
	});

	test('routes every page checkbox through the shared primitive', async () => {
		const pagesRoot = resolve(import.meta.dir, '../../frontend/src/pages');
		const glob = new Bun.Glob('**/*.tsx');
		const rawCheckboxes: string[] = [];
		for await (const file of glob.scan({ cwd: pagesRoot })) {
			const source = await Bun.file(join(pagesRoot, file)).text();
			if (source.includes('type="checkbox"')) rawCheckboxes.push(file);
		}

		expect(rawCheckboxes).toEqual([]);
	});

	test('keeps the audited hand-rolled controls on canonical styles', async () => {
		const auditedControls = [
			['pages/audits/tabs/AuditDefinitionEditor.tsx', 'textareaClass'],
			['pages/projects/detail/DeleteProjectCard.tsx', 'selectClass'],
			['pages/projects/detail/MoveProjectCard.tsx', 'selectClass'],
			['pages/projects/detail/ProfileTab.tsx', 'textareaClass'],
			['pages/runs/RunLaunchCard.tsx', 'selectClass'],
			['pages/skills/SkillImportDialog.tsx', 'selectClass'],
		] as const;

		for (const [file, canonicalClass] of auditedControls) {
			const source = await Bun.file(
				resolve(import.meta.dir, '../../frontend/src', file),
			).text();
			expect(source).toContain(canonicalClass);
		}
	});
});
