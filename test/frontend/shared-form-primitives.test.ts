import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { formControlClass, textareaClass } from '../../frontend/src/lib/formStyles.ts';

const stylesPath = resolve(import.meta.dir, '../../frontend/src/index.css');

function cssThemeBlock(styles: string, selector: ':root' | '.dark'): string {
	const escapedSelector = selector === '.dark' ? '\\.dark' : ':root';
	const match = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(styles);
	if (!match?.[1]) throw new Error(`Missing ${selector} theme block`);
	return match[1];
}

function cssHexToken(block: string, token: string): string {
	const match = new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`, 'i').exec(block);
	if (!match?.[1]) throw new Error(`Missing --${token} hex token`);
	return match[1];
}

function relativeLuminance(hex: string): number {
	const channels: [number, number, number] = [
		Number.parseInt(hex.slice(1, 3), 16) / 255,
		Number.parseInt(hex.slice(3, 5), 16) / 255,
		Number.parseInt(hex.slice(5, 7), 16) / 255,
	];
	const [red, green, blue] = channels;
	const linearize = (channel: number): number =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(first: string, second: string): number {
	const firstLuminance = relativeLuminance(first);
	const secondLuminance = relativeLuminance(second);
	return (
		(Math.max(firstLuminance, secondLuminance) + 0.05) /
		(Math.min(firstLuminance, secondLuminance) + 0.05)
	);
}

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

	test('keeps canonical control boundaries at non-text contrast in both themes', async () => {
		const styles = await Bun.file(stylesPath).text();

		for (const selector of [':root', '.dark'] as const) {
			const theme = cssThemeBlock(styles, selector);
			expect(
				contrastRatio(cssHexToken(theme, 'control-border'), cssHexToken(theme, 'card')),
			).toBeGreaterThanOrEqual(3);
		}

		expect(styles).toContain('--color-control-border: var(--control-border);');
		expect(formControlClass).toContain('border-control-border');
		expect(textareaClass).toContain('border-control-border');
		expect(formControlClass).not.toContain('border-border');
		expect(textareaClass).not.toContain('border-border');
	});

	test('renders the canonical label above its control and gives checkboxes semantic focus styling', () => {
		const { checkbox, field } = renderPrimitives();

		// The measure is part of the primitive: uncapped, a field inherited the card, which
		// inherited the shell, and every control on the Management tab measured 939px at 2250x1309.
		// A call site that genuinely wants full bleed passes `max-w-none`, which wins the merge.
		expect(field).toContain('<label class="grid max-w-[36rem] gap-1">');
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
