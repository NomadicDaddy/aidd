import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { formControlClass, selectClass, textareaClass } from '../../frontend/src/lib/formStyles.ts';
import { invalidControlClass } from '../../frontend/src/lib/tones.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SRC = join(FRONTEND_ROOT, 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

/** Comments naming the literal a file used to carry are the record of why it went, not the code. */
function stripComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function render(props: Record<string, boolean | null | string>, child: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FieldRow } from './src/components/ui/field.tsx';",
		`const row = createElement(FieldRow, ${JSON.stringify(props)}, createElement(${child}));`,
		'console.log(renderToStaticMarkup(row));',
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

/**
 * A form file is one that renders controls — it imports the shared control classes or `FieldRow`.
 * Defining the set this way rather than listing paths means a new form is covered the day it is
 * written, which is how the four competing error vocabularies accumulated in the first place.
 */
async function formFiles(): Promise<string[]> {
	const glob = new Bun.Glob('**/*.tsx');
	const files: string[] = [];
	for await (const file of glob.scan({ cwd: SRC })) {
		const source = await Bun.file(join(SRC, file)).text();
		if (/lib\/formStyles\.ts|ui\/field\.tsx/.test(source))
			files.push(file.replaceAll('\\', '/'));
	}
	return files.sort();
}

// Reds that are not error vocabulary. Each one is a category or a severity, not "you must fix this
// control", so routing it through the field-error class would say something untrue.
const exemptions: { file: string; why: string }[] = [
	{
		file: 'pages/projects/detail/dependencyGraphComponents.tsx',
		why: 'A categorical left border marking remediation-sourced nodes; tones has no border-l shape.',
	},
];

describe('one vocabulary for an invalid field', () => {
	test('FieldRow puts the message and the aria-invalid on the same decision', () => {
		const html = render({ error: 'Pick something else', label: 'Id' }, "'input'");

		// The two halves used to be two props at every call site, and they drifted apart in both
		// directions: red sentences beside controls reported as valid, and controls painted
		// invalid with nothing said about what was wrong.
		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('Pick something else');
		expect(html).toContain('role="alert"');
		// The message is the control's accessible description, not a paragraph that happens to
		// sit near it — so `aria-describedby` has to resolve to the id the message carries.
		const described = html.match(/aria-describedby="([^"]+)"/)?.[1];
		expect(described).toBeTruthy();
		expect(html).toContain(`id="${described}"`);
	});

	test('required marks the control, not just the label', () => {
		const html = render({ label: 'Project', required: true }, "'select'");

		expect(html).toContain('aria-required="true"');
		// The asterisk is decoration; `aria-required` is what gets read. Announcing "star" after
		// every label would be noise on top of the attribute that already says it.
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('*');
	});

	test('an untouched field asserts nothing about a value it does not have', () => {
		const html = render({ label: 'Project' }, "'select'");

		expect(html).not.toContain('aria-invalid');
		expect(html).not.toContain('role="alert"');
		expect(html).not.toContain('aria-describedby');
	});

	test('an existing description survives the error being added to it', () => {
		const script = [
			"import { createElement } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { FieldRow } from './src/components/ui/field.tsx';",
			"const child = createElement('input', { 'aria-describedby': 'hint-1' });",
			"const row = createElement(FieldRow, { error: 'Bad', label: 'Id' }, child);",
			'console.log(renderToStaticMarkup(row));',
		].join('\n');
		const result = Bun.spawnSync([process.execPath, '-e', script], {
			cwd: FRONTEND_ROOT,
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
		const html = new TextDecoder().decode(result.stdout);

		// A field with both a hint and an error describes the control with both, in that order.
		expect(html).toMatch(/aria-describedby="hint-1 [^"]+"/);
	});

	test('an invalid control keeps one border colour whether it is focused or not', async () => {
		const tones = await read('lib', 'tones.ts');
		const styles = await read('lib', 'formStyles.ts');

		// Controls carry `focus-visible:border-accent/60` at the same specificity as the plain
		// `aria-invalid` variant, and it is generated later — so the field turned teal the moment
		// the operator clicked in to fix it. The paired variant is what outranks it.
		expect(tones).toContain('aria-invalid:border-red-500');
		expect(tones).toContain('aria-invalid:focus-visible:border-red-500');
		expect(tones).toContain('dark:aria-invalid:focus-visible:border-red-400');
		// Textareas get the same treatment; `RecipeStepJsonField` hand-built a second skin
		// precisely because `textareaClass` had no invalid state to inherit. Asserted against the
		// resolved class strings rather than the source line: `formControlClass` composes its
		// chrome from `controlChromeClass` now that the width was lifted out of it, and reading the
		// declaration would have failed on the indirection while the property still held.
		for (const control of [formControlClass, selectClass, textareaClass])
			expect(control).toContain(invalidControlClass);
		expect(styles).toContain('${invalidControlClass}');
	});

	test('no form file spells its own red', async () => {
		const exempt = new Set(exemptions.map((entry) => entry.file));
		const offenders: string[] = [];
		for (const file of await formFiles()) {
			if (exempt.has(file)) continue;
			if (/(?:text|border|bg|ring)-red-/.test(stripComments(await read(file)))) {
				offenders.push(file);
			}
		}

		// There were four spellings of the same sentence and two skins for the same border.
		// Error colour is chosen once, in tones.ts, and reaches a field through `fieldErrorClass`
		// or the control's own `aria-invalid` variant.
		expect(offenders).toEqual([]);
	});

	test('the Skills project select is required, not invalid, on first paint', async () => {
		const form = await read('components', 'shared', 'LaunchForm.tsx');

		// It was `aria-invalid` before the operator had done anything at all — a false assertion
		// to a screen reader about a value the control had not been given a chance to hold.
		expect(form).toContain('<FieldRow label="Project" required>');
		expect(stripComments(form)).not.toContain('aria-invalid');
	});

	test('the fields that block a save say so before the save is attempted', async () => {
		const recipe = await read('pages', 'recipes', 'detail', 'RecipeEditMode.tsx');
		const milestone = await read('pages', 'projects', 'detail', 'MilestoneFormDialog.tsx');
		const create = await read('pages', 'projects', 'ProjectCreateLane.tsx');

		// Each of these already stops its submit handler and raises a toast, so the form was
		// refusing work it looked perfectly willing to accept.
		expect(recipe).toContain('<FieldRow error={idError} label="Id" required>');
		expect(recipe).toContain('label="Name" required={!nameReadOnly}');
		expect(milestone).toContain('required>');
		expect(create).toContain('<FieldRow error={nameError} label="Name" required>');
		// The one hand-drawn `*` in the app is gone; the marker travels with `aria-required` now.
		expect(create).not.toMatch(/<span className=\{toneText\.red\}> \*<\/span>/);
	});

	test('the second textarea skin is gone', async () => {
		const json = await read('pages', 'recipes', 'RecipeStepJsonField.tsx');
		const list = await read('pages', 'settings', 'ListEditor.tsx');

		expect(stripComments(json)).not.toContain('errorTextareaClass');
		expect(json).toContain('className={jsonTextareaClass}');
		// ListEditor skinned its own invalid border at region weight, beside an `aria-invalid`
		// that would have painted it correctly on its own.
		expect(stripComments(list)).not.toContain('toneBorder.red');
		expect(list).toContain('fieldErrorClass');
	});
});
