import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const DOCS_PAGE_PATH = resolve(FRONTEND_ROOT, 'src/pages/docs/DocsPage.tsx');

function renderDocsNotFound(slug: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DocsNotFound } from './src/pages/docs/DocsNotFound.tsx';",
		`const view = createElement(MemoryRouter, null, createElement(DocsNotFound, { slug: ${JSON.stringify(slug)} }));`,
		'console.log(JSON.stringify(renderToStaticMarkup(view)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;
}

describe('docs not-found pattern', () => {
	test('renders the shared failure identity and recovery treatment', async () => {
		const markup = renderDocsNotFound('no-such-section');
		const page = await Bun.file(DOCS_PAGE_PATH).text();

		expect(markup).toContain('data-aidd-page="not-found"');
		// The width is the docs page's, not a second decision: a section that exists and one that
		// does not are the same document shell, so they read at the same measure.
		expect(markup).toContain('data-content-rail="reading"');
		expect(markup).not.toContain('role="status"');
		expect(markup).toContain('>Documentation section not found</h1>');
		expect(markup).toContain(
			'The section may have been removed, or the link may be incorrect.',
		);
		expect(markup).toContain('No documentation section matches “no-such-section”.');
		expect(markup).toContain('href="/docs/getting-started"');
		expect(markup).toContain('>Back to Getting started</a>');
		expect(markup).toContain('border-accent bg-accent');
		expect(markup).toContain('max-w-[calc(46ch*0.875_+_2rem)]');
		expect(markup).toContain('aria-label="Documentation navigation"');
		expect(markup).toContain('>Guides<');
		expect(markup).not.toContain('<article');
		expect(page).toContain("'Docs · Section Not Found'");
		const declaration = 'const PAGE_RAIL = pageRailByContentType.reading;';
		expect(page).toContain(declaration);
		expect(
			await Bun.file(resolve(FRONTEND_ROOT, 'src/pages/docs/DocsNotFound.tsx')).text(),
		).toContain(declaration);
		expect(page).toContain('if (body === undefined) return <DocsNotFound slug={slug} />;');
	});
});
