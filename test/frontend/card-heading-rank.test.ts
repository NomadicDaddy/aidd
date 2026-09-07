import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function source(relative: string): string {
	return readFileSync(join(FRONTEND_ROOT, 'src', relative), 'utf8');
}

/** Renders one CardHeader at the requested rank and returns its markup. */
function renderHeaderAt(level: string): string {
	const script = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardHeader } from './src/components/ui/card.tsx';
const header = createElement(CardHeader, {
	id: 'rank-probe',
	level: '${level}',
	title: 'Probe',
});
console.log(renderToStaticMarkup(header));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('card headings and collection labels express their distinct roles', () => {
	test('the two declared ranks are visually distinct, and the id lands on the heading', () => {
		const section = renderHeaderAt('section');
		const subsection = renderHeaderAt('subsection');

		// The scale has exactly two steps, so "one rank above" has to mean a size step. If the
		// two ever resolve to the same string, every surface below is flat again.
		expect(section).not.toBe(subsection);
		expect(section).toContain('text-base');
		expect(subsection).toContain('text-sm');
		// aria-labelledby on a region only works if the id is on the heading element itself.
		expect(section).toContain('<h2 class=');
		expect(section).toContain('id="rank-probe"');
	});

	test('every pipeline step title keeps a readable visual rank and semantic depth', () => {
		const rows = source('pages/pipelineSessions/StepRows.tsx');
		const page = source('pages/pipelineSessions/PipelineSessionReportPage.tsx');

		expect(rows).toContain('level="section"');
		// The depth ladder belongs to headingLevel, which is semantics. Visual hierarchy also comes
		// from the nested card variants and explicit parent rail, not from shrinking body-sized titles.
		expect(rows).not.toContain('level={step.depth');
		expect(rows).toContain('headingLevel={stepHeadingLevel(step.depth)}');
		// The collection is a caption, not a competing card identity; it still owns the h2.
		const stepsCard = page.slice(page.indexOf('function StepsCard'));
		expect(stepsCard).toContain('className={sectionCaptionClass}');
		expect(stepsCard).toContain('aria-labelledby="execution-heading"');
		expect(stepsCard).not.toContain('<CardHeader');
	});

	test('the history day divider outranks the event titles by size as well as weight', () => {
		const history = source('pages/projects/detail/HistoryTab.tsx');

		expect(history).toContain('level="section"');
		expect(history).not.toContain('level="subsection"');
		// The rows stay one weight below and one size below, so the two differ on both axes.
		// Scoped to the row component: the comment above the divider names the weight too.
		const rowStart = history.indexOf('function HistoryEventRow');
		const rowEnd = history.indexOf('export function HistoryTab');
		expect(rowStart).toBeGreaterThan(-1);
		expect(rowEnd).toBeGreaterThan(rowStart);
		const row = history.slice(rowStart, rowEnd);
		expect(row).toContain('font-medium text-foreground');
		expect(row).not.toContain('font-semibold');
	});

	test('the audit catalog names itself like the two cards it is stacked with', () => {
		const tab = source('pages/audits/tabs/CatalogTab.tsx');

		expect(tab).toContain('title="Audit Catalog"');
		expect(tab).toContain('id={auditCatalogHeadingId}');
		// The region is labelled by the visible heading rather than by a string only a screen
		// reader ever saw, which is what let the card go unnamed on screen for so long.
		expect(tab).toContain('aria-labelledby={auditCatalogHeadingId}');
		expect(tab).not.toContain('aria-label="Audit catalog list"');
	});
});
