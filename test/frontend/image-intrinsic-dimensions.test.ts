import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function render(componentImport: string, element: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		componentImport,
		`console.log(renderToStaticMarkup(${element}));`,
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

function source(...segments: string[]): string {
	return readFileSync(join(FRONTEND_ROOT, 'src', ...segments), 'utf-8');
}

describe('responsive image surfaces carry intrinsic dimensions', () => {
	test('the shell favicon states the 40px box it occupies', () => {
		const appLayout = source('components', 'layout', 'AppLayout.tsx');
		const favicon = /<img\b[\s\S]*?favicon-96x96\.png[\s\S]*?\/>/.exec(appLayout)?.[0];

		expect(favicon).toBeDefined();
		expect(favicon).toContain('height={40}');
		expect(favicon).toContain('width={40}');
		// The classes and the attributes have to agree, or the attributes describe a box the
		// browser never draws.
		expect(favicon).toContain('h-10 w-10');
	});

	test('the decoded code-file preview applies its natural size as intrinsic attributes', () => {
		const html = render(
			"import { DecodedImage } from './src/pages/projects/detail/ImageFilePreview.tsx';",
			"createElement(DecodedImage, { alt: 'assets/logo.png', size: { height: 640, width: 1280 }, src: 'data:image/png;base64,AAAA' })",
		);

		expect(html).toContain('width="1280"');
		expect(html).toContain('height="640"');
		expect(html).toContain('alt="assets/logo.png"');
	});

	test('the preview stays constrained at narrow widths despite its intrinsic width', () => {
		const html = render(
			"import { DecodedImage } from './src/pages/projects/detail/ImageFilePreview.tsx';",
			"createElement(DecodedImage, { alt: 'wide.png', size: { height: 200, width: 4096 }, src: 'data:image/png;base64,AAAA' })",
		);

		// A 4096px intrinsic width must not be able to widen the pane: the caps are what keep
		// the declared dimensions an aspect-ratio hint rather than a layout demand.
		expect(html).toContain('max-w-full');
		expect(html).toContain('max-h-full');
		expect(html).toContain('object-contain');
	});

	test('nothing renders an <img> before the decode resolves', () => {
		// Server rendering runs no effects, so this is the pre-decode frame by construction.
		const html = render(
			"import { ImageFilePreview } from './src/pages/projects/detail/ImageFilePreview.tsx';",
			"createElement(ImageFilePreview, { alt: 'assets/logo.png', src: 'data:image/png;base64,AAAA' })",
		);

		expect(html).not.toContain('<img');
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain('Loading image preview…');
	});

	test('the preview owns a decode-failure branch and never falls back to a bare <img>', () => {
		const preview = source('pages', 'projects', 'detail', 'ImageFilePreview.tsx');
		const viewer = source('pages', 'projects', 'detail', 'CodeFileViewer.tsx');

		expect(preview).toContain('.decode()');
		expect(preview).toContain('naturalHeight');
		expect(preview).toContain('naturalWidth');
		expect(preview).toMatch(/\.catch\([\s\S]{0,160}status: 'error'/);
		// The viewer must delegate rather than keep a second, dimensionless <img> around.
		expect(viewer).toContain('<ImageFilePreview');
		expect(viewer).not.toMatch(/<img\b/);
	});
});
