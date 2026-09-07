import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderTerminalPaneHeader(): string {
	const script = [
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { TerminalPaneHeader } from './src/components/terminal/TerminalPaneHeader.tsx';",
		'const client = new QueryClient();',
		"client.setQueryData(['terminal-shells'], { shells: [{ id: 'pwsh', label: 'PowerShell 7' }] });",
		'const tab = (sessionId, cwd) => ({',
		"\tinfo: { cols: 80, createdAt: '2026-09-01T00:00:00.000Z', cwd, exitCode: null, rows: 24, sessionId, shellId: 'pwsh', status: 'running' },",
		"\tstatus: 'connected',",
		'});',
		'const view = createElement(QueryClientProvider, { client }, createElement(TerminalPaneHeader, {',
		"\tactiveSessionId: 'one',",
		"\ttabs: [tab('one', 'D:/applications/aidd'), tab('two', 'D:/applications/spernakit')],",
		'}));',
		'console.log(renderToStaticMarkup(view));',
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

describe('responsive terminal pane header', () => {
	test('gives terminal tabs a dedicated phone row and restores the desktop row', () => {
		const html = renderTerminalPaneHeader();

		expect(html).toContain(
			'grid shrink-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1 sm:flex sm:h-9 sm:py-0',
		);
		expect(html).toContain('col-span-3 row-start-2 min-w-0 sm:flex-1');
		expect(html).toContain(
			'col-start-3 row-start-1 flex min-w-0 items-center gap-1 justify-self-stretch sm:contents',
		);
	});

	test('keeps both tabs, their actions, and the shrinkable shell selector in the rendered header', () => {
		const html = renderTerminalPaneHeader();

		expect(html).toContain('aria-label="Terminal tabs"');
		expect(html).toContain('>aidd</button>');
		expect(html).toContain('>spernakit</button>');
		expect(html).toContain('aria-label="Close terminal tab aidd"');
		expect(html).toContain('aria-label="Close terminal tab spernakit"');
		expect(html).toContain('aria-label="New terminal tab"');
		expect(html).toContain('aria-label="Shell for new tabs"');
		expect(html).toContain('h-6 min-w-0 flex-1');
		expect(html).toContain('sm:flex-none');
		expect(html).toContain('>PowerShell 7</option>');
	});
});
