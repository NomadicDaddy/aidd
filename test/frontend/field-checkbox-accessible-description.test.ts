import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderFieldCheckbox(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FieldCheckbox } from './src/components/ui/field.tsx';",
		"const field = createElement(FieldCheckbox, { 'aria-describedby': 'standing-help', description: 'Off by default. When enabled, the agent can edit project files and run shell commands without run-level supervision.', label: 'Allow Director chat to edit project files directly' });",
		'console.log(renderToStaticMarkup(field));',
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

describe('FieldCheckbox accessible description', () => {
	test('names the checkbox from its label and describes it with the long help text', () => {
		const html = renderFieldCheckbox();
		const input = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0];
		const labelId = input?.match(/aria-labelledby="([^"]+)"/)?.[1];
		const describedIds = input?.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? [];

		expect(labelId).toBeTruthy();
		expect(html).toMatch(
			new RegExp(
				`<span[^>]*id="${labelId}"[^>]*>Allow Director chat to edit project files directly</span>`,
			),
		);
		expect(describedIds).toHaveLength(2);
		expect(describedIds[0]).toBe('standing-help');
		expect(html).toContain(`id="${describedIds[1]}"`);
		expect(html).toContain('Off by default. When enabled');
		// The native label still owns the description as part of its click target, but the input's
		// explicit aria-labelledby keeps that paragraph out of the accessible name.
		expect(html).toMatch(/<label[^>]*>[\s\S]*Off by default[\s\S]*<\/label>/u);
	});
});
