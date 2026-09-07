import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

interface RenderedRepositoryInfo {
	all: string;
	limited: string;
}

function renderRepositoryInfo(): RenderedRepositoryInfo {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryInfoCard } from './src/pages/projects/detail/RepositoryInfoCard.tsx';

const languageNames = [
	'TypeScript',
	'JavaScript',
	'JSON',
	'Markdown',
	'CSS',
	'HTML',
	'PowerShell',
	'Shell',
	'SQL',
	'YAML',
];

function repositoryInfo(languageCount) {
	return {
		authors: [
			{ commits: 12, email: 'one@example.test', name: 'Contributor One' },
			{ commits: 8, email: 'two@example.test', name: 'Contributor Two' },
		],
		currentBranch: 'main',
		dominantLanguage: 'TypeScript',
		languages: languageNames.slice(0, languageCount).map((language, index) => ({
			bytes: 10_000 - index * 100,
			files: 20 - index,
			language,
			lines: 1_000 - index * 100,
		})),
		latestCommit: null,
		localBranches: 1,
		remoteBranches: 1,
		sizeBytes: 10_000,
		tags: 2,
		totalFiles: 100,
		totalLines: 5_500,
		truncated: false,
	};
}

function render(languageCount) {
	return renderToStaticMarkup(
		createElement(RepositoryInfoCard, { info: repositoryInfo(languageCount) }),
	);
}

console.log(JSON.stringify({ all: render(6), limited: render(10) }));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedRepositoryInfo;
}

function heading(markup: string, title: string): string {
	const titleStart = markup.indexOf(`>${title}</h4>`);
	const headerEnd = markup.indexOf('</header>', titleStart);
	return markup.slice(titleStart, headerEnd);
}

describe('repository language count', () => {
	const rendered = renderRepositoryInfo();

	test('counts every detected language and discloses the top-six display limit', () => {
		expect(heading(rendered.limited, 'Languages')).toContain('>10</span>');
		expect(heading(rendered.limited, 'Languages')).toContain(
			'Showing the top 6 of 10 detected languages.',
		);
		expect(heading(rendered.limited, 'Top contributors')).toContain('>2</span>');
		expect(rendered.limited).toContain('HTML');
		expect(rendered.limited).not.toContain('PowerShell');
	});

	test('omits the limit disclosure when every language is shown', () => {
		expect(heading(rendered.all, 'Languages')).toContain('>6</span>');
		expect(rendered.all).not.toContain('Showing the top');
		expect(rendered.all).toContain('HTML');
	});
});
