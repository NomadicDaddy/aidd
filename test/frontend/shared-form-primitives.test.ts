import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import {
	controlFocusClass,
	fieldHintClass,
	formControlClass,
	monoTextareaClass,
	quietSelectClass,
	selectClass,
	textareaClass,
} from '../../frontend/src/lib/formStyles.ts';
import { invalidControlClass } from '../../frontend/src/lib/tones.ts';
import {
	compactFieldMeasureClass,
	monoEditorMeasureClass,
	proseMeasureClass,
} from '../../frontend/src/lib/typography.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');
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

function secondaryButtonClasses(isBlocked = false): string {
	const script = [
		"import { buttonClassName } from './src/components/ui/button.tsx';",
		`console.log(buttonClassName('secondary', undefined, 'default', ${isBlocked}));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

function renderPrimitives(): { checkbox: string; field: string; group: string; nested: string } {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Checkbox } from './src/components/ui/checkbox.tsx';",
		"import { FieldRow } from './src/components/ui/field.tsx';",
		"import { Input } from './src/components/ui/input.tsx';",
		"const field = createElement(FieldRow, { hint: 'Choose a project.', label: 'Project' }, createElement(Input, { id: 'project-field', name: 'project' }));",
		"const group = createElement(FieldRow, { group: true, hint: 'Choose a source.', label: 'Spec' }, createElement('button', null, 'None'), createElement('button', null, 'Paste text'));",
		"const nested = createElement(FieldRow, { controlId: 'nested-search', label: 'Search' }, createElement('div', { className: 'relative' }, createElement(Input, { id: 'nested-search' })));",
		"const checkbox = createElement(Checkbox, { 'aria-label': 'Enabled' });",
		'console.log(JSON.stringify({ checkbox: renderToStaticMarkup(checkbox), field: renderToStaticMarkup(field), group: renderToStaticMarkup(group), nested: renderToStaticMarkup(nested) }));',
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
		group: string;
		nested: string;
	};
}

describe('shared form primitives', () => {
	test('makes canonical controls fill and shrink within their field', () => {
		expect(formControlClass).toContain('w-full');
		expect(formControlClass).toContain('min-w-0');
		expect(textareaClass).toContain('w-full');
		expect(textareaClass).toContain('min-w-0');
	});

	test('keeps canonical field focus rings aligned with other shared controls', () => {
		expect(controlFocusClass).toBe(
			'focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/80',
		);
		for (const className of [formControlClass, selectClass, textareaClass]) {
			expect(className).toContain(controlFocusClass);
			expect(className).not.toContain('focus-visible:ring-ring/20');
			expect(className).toContain('aria-invalid:focus-visible:ring-3');
			// One red at one alpha cannot clear the 3:1 non-text floor on a white card and a
			// #161a22 one, so the invalid ring splits by theme. red-400/60 measured 1.84:1 on the
			// light card. The ratios themselves are checked in focus-ring-contrast.test.ts.
			expect(className).toContain('aria-invalid:focus-visible:ring-red-600/80');
			expect(className).toContain('dark:aria-invalid:focus-visible:ring-red-400/80');
		}

		expect(invalidControlClass).not.toContain('aria-invalid:focus-visible:ring-2');
		expect(invalidControlClass).not.toContain('aria-invalid:focus-visible:ring-red-400/40');
	});

	test('gives every canonical form control a shared disabled treatment', () => {
		for (const className of [formControlClass, quietSelectClass, selectClass, textareaClass]) {
			expect(className).toContain('disabled:cursor-not-allowed');
			expect(className).toContain('disabled:bg-muted');
			expect(className).toContain('disabled:text-muted-foreground');
			expect(className).toContain('disabled:opacity-60');
		}
	});

	test('keeps canonical control boundaries at non-text contrast in both themes', async () => {
		const styles = await Bun.file(stylesPath).text();
		const secondaryButton = secondaryButtonClasses();
		const blockedSecondaryButton = secondaryButtonClasses(true);

		for (const selector of [':root', '.dark'] as const) {
			const theme = cssThemeBlock(styles, selector);
			const controlBorder = cssHexToken(theme, 'control-border');
			for (const hostSurface of ['card', 'background']) {
				expect(
					contrastRatio(controlBorder, cssHexToken(theme, hostSurface)),
				).toBeGreaterThanOrEqual(3);
			}
		}

		expect(styles).toContain('--color-control-border: var(--control-border);');
		expect(secondaryButton).toContain('border-control-border');
		expect(secondaryButton).toContain('bg-card');
		expect(secondaryButton).not.toContain('bg-accent text-accent-foreground');
		expect(blockedSecondaryButton).toContain('border-control-border');
		expect(blockedSecondaryButton).toContain('hover:border-control-border');
		expect(formControlClass).toContain('border-control-border');
		expect(textareaClass).toContain('border-control-border');
		expect(formControlClass).not.toMatch(/(?:^|\s)border-border(?:\s|$)/u);
		expect(textareaClass).not.toMatch(/(?:^|\s)border-border(?:\s|$)/u);
	});

	test('gives repeated selects a quiet resting surface and canonical focus chrome', () => {
		expect(quietSelectClass).toMatch(/(?:^|\s)border-border(?:\s|$)/u);
		expect(quietSelectClass).toMatch(/(?:^|\s)bg-muted(?:\s|$)/u);
		expect(quietSelectClass).not.toContain('border-transparent');
		expect(quietSelectClass).not.toContain('bg-muted/50');
		expect(quietSelectClass).not.toContain('bg-transparent');
		expect(quietSelectClass).toContain('group-hover/quiet:border-control-border');
		expect(quietSelectClass).toContain('group-hover/quiet:bg-card');
		expect(quietSelectClass).toContain('focus:bg-card');
		expect(quietSelectClass).toContain(controlFocusClass);
	});

	test('matches textarea measure to the authored content role', () => {
		expect(textareaClass).toContain(proseMeasureClass);
		expect(textareaClass).not.toContain(monoEditorMeasureClass);
		expect(monoTextareaClass).toContain(monoEditorMeasureClass);
		expect(monoTextareaClass).not.toContain(proseMeasureClass);
	});

	test('keeps shared focus and textarea variants intact at their rendered call sites', async () => {
		const source = (path: string) =>
			Bun.file(resolve(import.meta.dir, '../../frontend/src', path)).text();
		const focusUsers = await Promise.all([
			source('components/ui/tooltip.tsx'),
			source('pages/projects/detail/auditRowContent.tsx'),
		]);
		for (const user of focusUsers) {
			expect(user).toContain('controlFocusClass');
			expect(user).not.toContain('focus-visible:ring-ring/40');
			expect(user).not.toContain('focus-visible:ring-ring/70');
		}
		const telemetryBucketBar = await source('pages/telemetry/TelemetryBucketBar.tsx');
		expect(telemetryBucketBar).toContain('<Tooltip');
		for (const path of [
			'pages/telemetry/TelemetryComponents.tsx',
			'pages/telemetry/OutputTimeseriesChart.tsx',
		]) {
			expect(await source(path)).toContain('TelemetryBucketBar');
		}

		for (const path of [
			'pages/audits/tabs/ApplicabilityMappingEditor.tsx',
			'pages/audits/tabs/AuditDefinitionEditor.tsx',
			'pages/audits/tabs/OverridesRulesCard.tsx',
			'pages/projects/detail/NotesTab.tsx',
			'pages/recipes/RecipeStepJsonField.tsx',
		]) {
			expect(await source(path)).toContain('monoTextareaClass');
		}

		for (const path of [
			'pages/projects/detail/FindingDismissalDialog.tsx',
			'pages/projects/detail/ProfileTab.tsx',
		]) {
			expect(await source(path)).not.toContain('min-h-24');
		}
	});

	test('renders the canonical label above its control and gives checkboxes semantic focus styling', () => {
		const { checkbox, field, group, nested } = renderPrimitives();

		// The parent track owns the measure; the shared primitive must not override its width.
		expect(field).toContain('<div class="grid content-start gap-1">');
		expect(field).not.toContain('grid content-start gap-1 max-w-');
		expect(field).not.toContain('<label class="contents">');
		const labelFor = field.match(/<label[^>]*for="([^"]+)"/)?.[1];
		expect(labelFor).toBe('project-field');
		expect(field).toContain('id="project-field"');
		expect(field.indexOf('Project')).toBeLessThan(field.indexOf('<input'));
		const described = field.match(/aria-describedby="([^"]+)"/)?.[1];
		expect(described).toBeTruthy();
		expect(field).toContain(
			`<div class="${fieldHintClass}" id="${described}"><div class="${proseMeasureClass}">Choose a project.</div></div>`,
		);
		expect(field.indexOf(`id="${described}"`)).toBeGreaterThan(field.indexOf('</label>'));
		const groupLabel = group.match(/<span[^>]*id="([^"]+)"[^>]*>Spec<\/span>/)?.[1];
		expect(groupLabel).toBeTruthy();
		expect(group).toContain(`aria-labelledby="${groupLabel}"`);
		expect(group).toContain('role="group"');
		expect(group).not.toContain('<label');
		expect(nested).toContain('for="nested-search"');
		expect(nested).toMatch(/<div class="relative"><input[^>]*id="nested-search"/);
		expect(nested).not.toContain('<div class="relative" id=');
		expect(field).toContain('uppercase');
		expect(checkbox).toContain('type="checkbox"');
		expect(checkbox).toContain('accent-accent');
		expect(checkbox).toContain('focus-visible:ring-2');
	});

	test('keeps compact field widths explicit at the call site', async () => {
		expect(compactFieldMeasureClass).toBe('max-w-[36rem]');

		for (const file of [
			'RenameProjectCard.tsx',
			'MoveProjectCard.tsx',
			'DeleteProjectCard.tsx',
		]) {
			const source = await Bun.file(
				resolve(import.meta.dir, '../../frontend/src/pages/projects/detail', file),
			).text();
			expect(source).toContain('compactFieldMeasureClass');
			expect(source).toContain('className={compactFieldMeasureClass}');
		}
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
			['pages/audits/tabs/AuditDefinitionEditor.tsx', 'monoTextareaClass'],
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
