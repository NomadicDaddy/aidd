import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
type ButtonSize = 'default' | 'icon';
type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';

function buttonClasses(
	variant: ButtonVariant,
	size: ButtonSize = 'default',
	isBlocked = false,
): string {
	const script = [
		"import { buttonClassName } from './src/components/ui/button.tsx';",
		`console.log(buttonClassName('${variant}', undefined, '${size}', ${isBlocked}));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

function blockedButtonClasses(variant: ButtonVariant, size: ButtonSize = 'default'): string {
	return buttonClasses(variant, size, true);
}

function renderButton(props: Record<string, boolean | string>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Button } from './src/components/ui/button.tsx';",
		`console.log(renderToStaticMarkup(createElement(Button, ${JSON.stringify(props)}, 'Launch')));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

describe('disabled control weight', () => {
	test('gives a blocked primary the same inert surface as neighboring controls', () => {
		const primaryClasses = blockedButtonClasses('primary');
		const secondaryClasses = blockedButtonClasses('secondary');

		expect(primaryClasses).toContain('border-control-border');
		expect(primaryClasses).toContain('bg-card');
		expect(primaryClasses).toContain('text-muted-foreground');
		expect(secondaryClasses).toContain('bg-card');
		expect(primaryClasses).not.toBe(secondaryClasses);
	});

	test('lowers every blocked variant and neutralizes the primary plate', () => {
		for (const variant of ['danger', 'ghost', 'secondary'] as const) {
			expect(blockedButtonClasses(variant)).toContain('opacity-50');
		}
		expect(blockedButtonClasses('primary')).toContain('opacity-60');

		const dangerClasses = blockedButtonClasses('danger');
		expect(dangerClasses).toContain('border-red-800');
		expect(dangerClasses).toContain('bg-red-700');
		expect(dangerClasses).toContain('dark:border-red-400');
		expect(dangerClasses).toContain('hover:bg-red-700');
	});

	test('gives enabled danger controls a distinct boundary and pointer-hover step', () => {
		const blockedClasses = blockedButtonClasses('danger');
		const enabledClasses = buttonClasses('danger');

		expect(enabledClasses).toContain('border-red-800');
		expect(enabledClasses).toContain('bg-red-700');
		expect(enabledClasses).toContain('hover:border-red-700');
		expect(enabledClasses).toContain('hover:bg-red-600');
		expect(enabledClasses).not.toContain('bg-red-50');
		expect(enabledClasses).not.toContain('dark:bg-red-950/40');
		expect(blockedClasses).not.toContain('hover:bg-red-600');
	});

	test('keys chromeless blocked styling on ghost variant rather than icon size', () => {
		const ghostTextClasses = blockedButtonClasses('ghost');
		const secondaryIconClasses = blockedButtonClasses('secondary', 'icon');

		expect(ghostTextClasses).toContain('border-transparent');
		expect(ghostTextClasses).toContain('bg-transparent');
		expect(ghostTextClasses).not.toContain('bg-muted');
		expect(secondaryIconClasses).toContain('bg-card');
		expect(secondaryIconClasses).not.toContain('hover:bg-transparent');
	});

	test('suppresses disabled option chrome inside a segmented-control track', async () => {
		const segmentedControl = await readFile(
			resolve(FRONTEND_ROOT, 'src/components/ui/segmented-control.tsx'),
			'utf8',
		);

		expect(segmentedControl).toMatch(
			/option\.disabled\s+&&\s+'border-transparent bg-transparent shadow-none hover:border-transparent hover:bg-transparent'/u,
		);
		expect(segmentedControl).toContain('disabled={option.disabled}');
	});

	test('marks every project-intake commit action as primary', async () => {
		const [createActions, ingestLane] = await Promise.all([
			readFile(resolve(FRONTEND_ROOT, 'src/pages/projects/ProjectCreateActions.tsx'), 'utf8'),
			readFile(resolve(FRONTEND_ROOT, 'src/pages/projects/ProjectIngestLane.tsx'), 'utf8'),
		]);

		expect(createActions).toMatch(
			/<Button disabled=\{createDisabled\} onClick=\{onSubmit\} variant="primary">/u,
		);
		expect(ingestLane).toMatch(
			/disabled=\{selectedIds\.size === 0 \|\| importProjects\.isPending\}[\s\S]*?variant="primary"/u,
		);
	});

	test('keeps Move project secondary while its disabled styling lowers its weight', async () => {
		const [moveProject, crawlAssertion] = await Promise.all([
			readFile(
				resolve(FRONTEND_ROOT, 'src/pages/projects/detail/MoveProjectCard.tsx'),
				'utf8',
			),
			readFile(
				resolve(
					FRONTEND_ROOT,
					'../scripts/lib/crawltest/page-assertions/disabled-affordance.ts',
				),
				'utf8',
			),
		]);

		expect(moveProject).toContain('variant="secondary"');
		expect(moveProject).not.toContain("moveDisabled ? 'secondary' : 'primary'");
		expect(crawlAssertion).toContain("classes.has('bg-card')");
		expect(crawlAssertion).toContain("classes.has('border-control-border')");
		expect(crawlAssertion).toContain('opacity > 0.55');
		expect(crawlAssertion).not.toContain('isNeutralColor(move.background)');
	});

	test('moves a blocked button explanation onto a focusable tooltip trigger', () => {
		const blocked = renderButton({ disabled: true, title: 'Select a project first.' });
		const enabled = renderButton({ title: 'Launch now.' });

		expect(blocked).toMatch(/^<span[^>]*aria-disabled="true"[^>]*tabindex="0"[^>]*><button/u);
		expect(blocked).toContain('aria-label="Launch. Unavailable: Select a project first."');
		expect(blocked).toContain('role="button"');
		expect(blocked).toContain('disabled=""');
		expect(blocked).not.toContain('title="Select a project first."');
		expect(enabled).toContain('title="Launch now."');
		expect(enabled).not.toContain('tabindex="0"');
	});

	test('does not manufacture a stop for a redundant blocked tooltip label', () => {
		const blocked = renderButton({ disabled: true, title: 'Launch' });

		expect(blocked).not.toContain('tabindex="0"');
		expect(blocked).not.toContain('role="button"');
	});
});
