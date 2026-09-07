import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderDirectorQueueCard(): string {
	const suggestion = {
		description: 'Inspect the selected feature.',
		id: 'suggestion-1',
		projectId: 'aidd',
		riskLevel: 'MEDIUM',
		taskType: 'coding',
		title: 'Resolve the audit finding',
	};
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorQueueCard } from './src/pages/dashboard/DirectorQueueCard.tsx';",
		`const suggestions = [${JSON.stringify(suggestion)}];`,
		'const card = createElement(DirectorQueueCard, { isLoading: false, suggestions });',
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, card)));',
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

describe('DirectorQueueCard heading hierarchy', () => {
	test('renders the card heading before its nested suggestion heading', () => {
		const html = renderDirectorQueueCard();
		const cardHeadingEnd = html.indexOf('</h2>');
		const suggestionHeadingStart = html.indexOf('<h3');

		expect(html).toContain('<h2');
		expect(html).toContain('Director Queue</h2>');
		expect(html).toContain('Resolve the audit finding</h3>');
		expect(cardHeadingEnd).toBeGreaterThan(-1);
		expect(suggestionHeadingStart).toBeGreaterThan(cardHeadingEnd);
	});
});
