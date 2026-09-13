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

function renderDetails(props: Record<string, null | string>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ExecutionIdentityDetails } from './src/components/shared/ExecutionIdentityBadges.tsx';",
		`console.log(renderToStaticMarkup(createElement(ExecutionIdentityDetails, ${JSON.stringify(props)})));`,
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

const full = { backend: 'codex', model: 'gpt-6-astra', reasoningEffort: 'high' };

describe('execution identity survives a narrow column', () => {
	test('compact retains canonical CLI, model, and reasoning labels', () => {
		const html = render({ ...full, variant: 'compact' });

		// Compact removes width floors, not facts. Each segment may truncate independently in a
		// narrow cell, while its text remains present and the tooltip preserves the complete values.
		expect(html).toContain('>Codex<');
		expect(html).toContain('>gpt-6-astra<');
		expect(html).toContain('>high<');
		expect(html).not.toContain('lucide-square-terminal');
		expect(html).not.toContain('lucide-gauge');
		expect(html).toContain('flex-auto');
		expect(html.match(/flex-auto/gu)).toHaveLength(2);
		expect(html).toContain('shrink-0');
		expect(html).toContain('CLI Codex, Model gpt-6-astra, Reasoning high');
		expect(html).toContain('tabindex="0"');
	});

	test('compact can retain the reasoning label when its table column budgets for it', () => {
		const html = render({ ...full, compactReasoningLabel: true, variant: 'compact' });

		expect(html).toContain('>gpt-6-astra<');
		expect(html).toContain('>high<');
		expect(html).toContain('>Codex<');
		expect(html).toContain('px-0.5');
		expect(html).not.toContain('px-1.5');
	});

	test('compact does not cap the model below the column it was given', () => {
		const compact = render({ ...full, variant: 'compact' });

		expect(compact).not.toContain('max-w-48');
		expect(compact).not.toContain('min-w-[4.5rem]');
		expect(compact).not.toContain('min-w-16');
		expect(render(full)).toContain('max-w-48');
	});

	test('compact retains every available label when model is absent', () => {
		const modelLess = render({
			backend: 'direct',
			reasoningEffort: 'high',
			variant: 'compact',
		});
		const reasoningOnly = render({ reasoningEffort: 'high', variant: 'compact' });

		expect(modelLess).toContain('>Direct AI<');
		expect(modelLess).toContain('>high<');
		expect(modelLess).not.toContain('lucide-gauge');
		expect(reasoningOnly).toContain('>high<');
		expect(reasoningOnly).toContain('lucide-gauge');
		for (const html of [modelLess, reasoningOnly]) {
			expect(html).not.toContain('min-w-[4.5rem]');
			expect(html).not.toContain('min-w-16');
			expect(html).not.toContain('max-w-32');
		}
	});

	test('every segment is recoverable through the tooltip, not only the model', async () => {
		const source = await read('components', 'shared', 'ExecutionIdentityBadges.tsx');

		// A clipped backend must stay recoverable: a `title` gated on `item.kind === 'model'` leaves
		// two of the three segments no way back at all, and a native `title` on all three is
		// mouse-only. The whole identity — every segment, plus provider and hint — is one tooltip,
		// on both variants, whatever is clipped.
		expect(source).toContain('return withTooltip ? (');
		expect(source).not.toContain('hasHiddenDetails');

		// Default and compact reach it the same way; only their width floors differ.
		for (const props of [full, { ...full, variant: 'compact' }]) {
			const html = render(props);
			expect(html).toContain('tabindex="0"');
			expect(html).toContain('CLI Codex, Model gpt-6-astra, Reasoning high');
			// The mouse-only fallback is gone, not layered underneath.
			expect(html).not.toContain('title=');
		}
	});

	test('truncation takes characters off the head so the tail survives', async () => {
		const source = await read('components', 'shared', 'ExecutionIdentityBadges.tsx');

		// The model family at the start is the stable discriminator operators recognize. Ordinary
		// tail truncation preserves that prefix instead of spending the final width on a suffix.
		expect(source).toContain("export const identityTruncateClass = 'truncate text-left'");
		expect(source).not.toContain('[direction:rtl]');
		expect(render(full)).toContain('truncate text-left');
		// The isolate keeps punctuation such as the hyphen in `glm-5.3` ordered correctly.
		expect(render(full)).toContain('<bdi dir="ltr">gpt-6-astra</bdi>');
	});

	test('machine identifiers render in font-mono', () => {
		const html = render(full);

		expect(html).toContain('font-mono font-semibold text-foreground');
		expect(html).toContain('font-mono font-medium text-muted-foreground');
	});

	test('tooltip details render machine values in font-mono', () => {
		const html = renderDetails({
			backend: 'native',
			model: 'glm-5.3',
			provider: 'zhipu',
			reasoningEffort: 'medium',
		});

		expect(html.match(/<dd class="min-w-0 break-all font-mono">/g)).toHaveLength(2);
		expect(html.match(/<dd class="min-w-0 break-all font-sans">/g)).toHaveLength(2);
		expect(html).toContain('>Native</dd>');
		expect(html).toContain('>Zhipu</dd>');
	});

	test('the Badge Lab has a specimen at the widths the component has to survive', async () => {
		const lab = (
			await Promise.all([
				read('pages', 'settings', 'ExecutionIdentityBadgeLabPage.tsx'),
				read('pages', 'settings', 'ExecutionIdentityConstrainedSpecimens.tsx'),
			])
		).join(String.fromCharCode(10));

		// The reason this shipped: every specimen rendered at its natural width, so the failing
		// case had no specimen and the lab could not fail.
		expect(lab).toContain('variant="compact"');
		for (const width of ['w-[240px]', 'w-[179px]', 'w-[120px]', 'w-[96px]']) {
			expect(lab).toContain(width);
		}
		expect(lab).not.toContain('representativeIdentities.slice');
	});

	test('Runs gives MODEL a real budget and the sub-rows follow it', async () => {
		const table = await read('pages', 'runs', 'UnifiedExecutionTable.tsx');
		const steps = await read('pages', 'runs', 'PipelineStepSubRows.tsx');

		// MODEL still keeps enough room for the discriminating label, but no longer gets that
		// budget from an equal/percentage split. The table's auto layout sizes compact columns
		// intrinsically while this minimum protects the execution identity at narrow widths.
		expect(table).toContain('<col className={`${contentSizedColumnClass} min-w-52`} />');
		expect(table).toContain('`${contentSizedColumnClass} min-w-24`');
		expect(table).not.toContain('w-[23%]');
		expect(table).not.toContain('w-[20%]');
		expect(table).not.toContain('w-[17%]');
		expect(table).not.toContain('w-[24%]');
		expect(table).not.toContain('w-[14%]');
		// The sub-rows follow it by being rows of this table rather than by restating the colgroup
		// as `fr` units: seven `<td>` under seven `<col>`, nothing to restate.
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
