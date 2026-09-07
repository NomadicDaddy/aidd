import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderPagination(page: number, pageSize: number, total: number): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Pagination } from './src/pages/projects/detail/Pagination.tsx';",
		'const onChange = () => undefined;',
		`console.log(renderToStaticMarkup(createElement(Pagination, { onChange, page: ${page}, pageSize: ${pageSize}, total: ${total} })));`,
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

describe('project detail pagination control', () => {
	test('states the full item total and position for one page', () => {
		const markup = renderPagination(0, 25, 8);

		expect(markup).toContain('Showing 1–8 of 8 items');
		expect(markup).toContain('<span>Page</span>');
		expect(markup).toContain('<span>of 1</span>');
		expect(markup.match(/<option/gu)).toHaveLength(1);
		expect(markup.match(/disabled=""/gu)).toHaveLength(2);
	});

	test('offers every page as a direct destination for a long result set', () => {
		const markup = renderPagination(2, 60, 383);

		expect(markup).toContain('Showing 121–180 of 383 items');
		expect(markup).toContain('<span>of 7</span>');
		expect(markup.match(/<option/gu)).toHaveLength(7);
		expect(markup).toContain('<option value="2" selected="">3</option>');
	});
});
