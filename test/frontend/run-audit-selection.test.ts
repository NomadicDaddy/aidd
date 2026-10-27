import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderSelection(auditsEnabled: boolean, value: string): string {
	const script = `
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuditRunSelection } from './src/pages/runs/AuditRunSelection.tsx';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(['audits'], {
	auditsEnabled: ${auditsEnabled},
	definitions: [
		{ enabled: true, name: 'SECURITY' },
		{ enabled: true, name: 'CODE_QUALITY' },
		{ enabled: false, name: 'DISABLED_AUDIT' },
	],
	projects: [],
});
console.log(renderToStaticMarkup(createElement(QueryClientProvider, { client },
	createElement(AuditRunSelection, { onChange: () => {}, value: ${JSON.stringify(value)} }))));
client.clear();
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

describe('Run launch audit selection', () => {
	test('renders an explicit empty choice rather than selecting a default audit', () => {
		const markup = renderSelection(true, '');
		expect(markup).toContain('Audit to run');
		expect(markup).toContain('value="" selected=""');
		expect(markup).not.toContain('DISABLED_AUDIT');
	});

	test('shows SECURITY as the selected audit instead of CODE_QUALITY', () => {
		const markup = renderSelection(true, 'SECURITY');
		expect(markup).toContain('value="SECURITY" selected=""');
		expect(markup).not.toContain('value="CODE_QUALITY" selected=""');
	});

	test('disables selection and explains when audits are globally disabled', () => {
		const markup = renderSelection(false, 'SECURITY');
		expect(markup).toContain('disabled=""');
		expect(markup).toContain('Audits are disabled in settings.');
	});
});
