import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderActiveRunLink(activeRuns: { count: number; latestRunId: null | string }): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { ProjectActiveRunLink } from './src/pages/projects/ProjectActiveRunLink.tsx';",
		`const link = createElement(ProjectActiveRunLink, { activeRuns: ${JSON.stringify(activeRuns)} });`,
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, link)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('ProjectActiveRunLink', () => {
	test('renders no treatment when a project has no active runs', () => {
		expect(renderActiveRunLink({ count: 0, latestRunId: null })).toBe('');
	});

	test('renders accessible single and multiple active-run links', () => {
		const single = renderActiveRunLink({ count: 1, latestRunId: 'run one' });
		const multiple = renderActiveRunLink({ count: 2, latestRunId: 'latest-run' });

		expect(single).toContain('href="/runs?run=run%20one"');
		expect(single).toContain('1 run active');
		expect(single).toContain('aria-label="Open latest active run: 1 run active"');
		expect(multiple).toContain('href="/runs?run=latest-run"');
		expect(multiple).toContain('2 runs active');
	});
});
