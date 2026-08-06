import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(FRONTEND_ROOT, 'src', ...segments)).text();
}

function render(props: Record<string, boolean | null | string>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ExecutionIdentityBadges } from './src/components/shared/ExecutionIdentityBadges.tsx';",
		`console.log(renderToStaticMarkup(createElement(ExecutionIdentityBadges, ${JSON.stringify(props)})));`,
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

const full = { backend: 'codex', model: 'gpt-5.6-sol', reasoningEffort: 'high' };

describe('execution identity survives a narrow column', () => {
	test('compact keeps the model whole and demotes the other two to their icons', () => {
		const html = render({ ...full, variant: 'compact' });

		// `co…  gpt-5…  hi…` named none of the three. The model is the discriminating one, so it
		// is the one that keeps its label; the other two keep their icons and lose their text.
		expect(html).toContain('>gpt-5.6-sol<');
		expect(html).not.toContain('>codex<');
		expect(html).not.toContain('>high<');
		expect(html).toContain('lucide-square-terminal');
		expect(html).toContain('lucide-gauge');
		// Demoting a label is hiding a detail, so it takes the same route out as a provider.
		expect(html).toContain('CLI codex, Model gpt-5.6-sol, Reasoning high');
		expect(html).toContain('tabindex="0"');
	});

	test('compact does not cap the model below the column it was given', () => {
		expect(render({ ...full, variant: 'compact' })).not.toContain('max-w-48');
		expect(render(full)).toContain('max-w-48');
	});

	test('every segment is recoverable through the tooltip, not only the model', async () => {
		const source = await read('components', 'shared', 'ExecutionIdentityBadges.tsx');

		// A clipped backend used to be unrecoverable by any means: `title` was gated on
		// `item.kind === 'model'`, so two of the three segments had no way back at all. Then it
		// was a native `title` on all three, which is mouse-only. Now the whole identity — every
		// segment, plus provider and hint — is one tooltip, on both variants, whatever is clipped.
		expect(source).toContain('return withTooltip ? (');
		expect(source).not.toContain('hasHiddenDetails');

		// Default and compact reach it the same way; only what they display differs.
		for (const props of [full, { ...full, variant: 'compact' }]) {
			const html = render(props);
			expect(html).toContain('tabindex="0"');
			expect(html).toContain('CLI codex, Model gpt-5.6-sol, Reasoning high');
			// The mouse-only fallback is gone, not layered underneath.
			expect(html).not.toContain('title=');
		}
	});

	test('truncation takes characters off the head so the tail survives', async () => {
		const source = await read('components', 'shared', 'ExecutionIdentityBadges.tsx');

		// `claude-opus-5` and `claude-fable-5` share their first eleven characters, so a
		// tail-truncated pair is a coin flip and a head-truncated one is the answer.
		expect(source).toContain(
			"export const identityTruncateClass = 'truncate text-left [direction:rtl]'",
		);
		expect(render(full)).toContain('truncate text-left [direction:rtl]');
		// Without the isolate, `glm-5.2` in an RTL box can put its hyphen on the wrong side of
		// the number: the neutral between a letter and a digit takes the surrounding direction.
		expect(render(full)).toContain('<bdi dir="ltr">gpt-5.6-sol</bdi>');
	});

	test('machine identifiers render in font-mono', () => {
		const html = render(full);

		expect(html).toContain('font-mono font-semibold text-foreground');
		expect(html).toContain('font-mono font-medium text-muted-foreground');
	});

	test('the Badge Lab has a specimen at the widths the component has to survive', async () => {
		const lab = await read('pages', 'settings', 'ExecutionIdentityBadgeLabPage.tsx');

		// The reason this shipped: every specimen rendered at its natural width, so the failing
		// case had no specimen and the lab could not fail.
		expect(lab).toContain('variant="compact"');
		for (const width of ['w-[240px]', 'w-[160px]', 'w-[120px]']) {
			expect(lab).toContain(width);
		}
	});

	test('Runs gives MODEL a real budget and the sub-rows follow it', async () => {
		const table = await read('pages', 'runs', 'UnifiedExecutionTable.tsx');
		const steps = await read('pages', 'runs', 'PipelineStepSubRows.tsx');

		// MODEL held 20% and ellipsised every segment; STATUS held 17% for one badge.
		expect(table).toContain('w-[26%]');
		expect(table).not.toContain('w-[20%]');
		expect(table).not.toContain('w-[17%]');
		// The sub-rows used to follow it by restating the colgroup as `fr` units. They follow it
		// now by being rows of this table: seven `<td>` under seven `<col>`, nothing to restate.
		expect(steps).not.toContain('grid-cols-[');
		expect(await read('pages', 'runs', 'PipelineStepTableRows.tsx')).not.toContain(
			'grid-cols-[',
		);
	});

	test('the table cells that had a budget use the compact variant', async () => {
		for (const file of [
			join('pages', 'runs', 'ActiveRunRow.tsx'),
			join('pages', 'runs', 'PipelineSessionRow.tsx'),
			join('pages', 'runs', 'PipelineStepSubRows.tsx'),
		]) {
			expect(await read(file)).toContain('variant="compact"');
		}
		// And the cell no longer caps itself below the column the colgroup already sized.
		expect(await read('pages', 'runs', 'ActiveRunRow.tsx')).not.toContain('max-w-[14rem]');
	});
});
