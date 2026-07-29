import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderTokenSparkline(): string {
	const points = [
		{ date: '2026-07-23', totalTokens: 0 },
		{ date: '2026-07-24', totalTokens: 15 },
		{ date: '2026-07-25', totalTokens: 0 },
		{ date: '2026-07-26', totalTokens: 0 },
		{ date: '2026-07-27', totalTokens: 20 },
		{ date: '2026-07-28', totalTokens: 10 },
		{ date: '2026-07-29', totalTokens: 7 },
	];
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { TokenSparkline } from './src/pages/projects/ProjectsTableCells.tsx';",
		`const points = ${JSON.stringify(points)};`,
		'console.log(renderToStaticMarkup(createElement(TokenSparkline, { points })));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return new TextDecoder().decode(result.stdout).trim();
}

describe('TokenSparkline', () => {
	test('renders a compact, accessible seven-day line graph', () => {
		const html = renderTokenSparkline();

		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="Tokens over the past 7 days: 52 total"');
		expect(html).toContain('viewBox="0 0 64 18"');
		expect(html).toContain('2026-07-24: 15 tokens');
		expect(html).toContain('<path');
		expect(html).toContain('stroke="currentColor"');
	});
});
