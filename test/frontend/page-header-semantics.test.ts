import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { markdownSummary } from '../../frontend/src/lib/markdownBlocks.ts';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): string {
	return readFileSync(resolve(ROOT, ...path.split('/')), 'utf8');
}

function renderHeaderDescription(markdown: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { PageHeader } from './src/components/shared/PageHeader.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		"import { renderMarkdownInline } from './src/components/shared/markdownInline.tsx';",
		"import { markdownSummary } from './src/lib/markdownBlocks.ts';",
		`const markdown = ${JSON.stringify(markdown)};`,
		"const description = renderMarkdownInline(markdownSummary(markdown) ?? '');",
		"const header = createElement(PageHeader, { description, title: 'Docs' });",
		"const page = createElement(PageRail, { rail: 'bounded' }, header);",
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, page)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(ROOT, 'frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('page header semantics', () => {
	test('uses one outline-only focus treatment across header and docs navigation', () => {
		const focus = read('frontend/src/lib/focusStyles.ts');
		const header = read('frontend/src/components/shared/PageHeader.tsx');
		const styles = read('frontend/src/pages/docs/docsNavigationStyles.ts');
		const markdown = read('frontend/src/components/shared/MarkdownContent.tsx');
		const layout = read('frontend/src/components/layout/AppLayout.tsx');

		expect(focus).toContain(
			"'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'",
		);
		expect(focus).not.toContain('focus-visible:ring');
		expect(focus).not.toContain('focus-visible:outline-none');
		for (const consumer of [header, styles, markdown, layout])
			expect(consumer).toContain('linkFocusClass');
	});

	test('preserves authored inline emphasis in a promoted lead', () => {
		const markdown =
			'# Audits\n\nAn **audit** reviews `SECURITY` and links to [Runs](/runs).\n\n## Catalog';
		const summary = markdownSummary(markdown);
		const html = renderHeaderDescription(markdown);

		expect(summary).toBe('An **audit** reviews `SECURITY` and links to [Runs](/runs).');
		expect(html).toContain('<strong>audit</strong>');
		expect(html).toContain('<code');
		expect(html).toContain('>SECURITY</code>');
		expect(html).toContain('<a class="text-accent underline underline-offset-2');
		expect(html).toContain('href="/runs"');
		expect(html).toContain('text-sm leading-relaxed text-muted-foreground');
		expect(html).not.toContain('**audit**');
	});
});
