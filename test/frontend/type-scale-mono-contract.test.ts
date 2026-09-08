import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function render(scriptBody: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		scriptBody,
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

function renderAbout(): string {
	return render(
		[
			"Object.assign(globalThis, { __AIDD_BUILD_REVISION__: '12345678', __AIDD_BUILD_TIMESTAMP__: '2026-09-01T12:00:00.000Z', __AIDD_REPOSITORY_URL__: '', __AIDD_VERSION__: '3.0.0' });",
			"const { AboutPage } = await import('./src/pages/about/AboutPage.tsx');",
			'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AboutPage))));',
		].join('\n'),
	);
}

function renderDashboardRows(): string {
	return render(
		[
			"const { FeatureStatusRows } = await import('./src/pages/dashboard/FeatureStatusRows.tsx');",
			"const { FeatureSummaryRows } = await import('./src/pages/dashboard/FeatureSummaryRows.tsx');",
			"const statusRow = { completed: false, directory: 'checkout-webhook-issuer', priority: 1, projectId: 'aidd', projectName: 'aidd', status: 'in_progress', title: 'Checkout Webhook Issuer', type: 'feature' };",
			"const summaryRow = { application: 'aidd', audit: 1, remediation: 2, feature: 3, pending: 4, completed: 5, total: 9 };",
			'const totals = { audit: 1, remediation: 2, feature: 3, pending: 4, completed: 5, total: 9 };',
			"const content = createElement('div', null, createElement(FeatureStatusRows, { rows: [statusRow] }), createElement(FeatureSummaryRows, { rows: [summaryRow], totals }));",
			'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, content)));',
		].join('\n'),
	);
}

describe('type-scale and mono contract boundaries', () => {
	test('renders About with a page h1 and a canonical card h2', () => {
		const html = renderAbout();

		expect(html).toContain(
			'<h1 class="font-display text-2xl font-bold tracking-tight text-foreground">About</h1>',
		);
		expect(html).toContain(
			'<h2 class="min-w-0 text-base font-semibold text-foreground">aidd</h2>',
		);
		expect(html).toContain(
			'AI Development Director - your local control panel for planning, running, and auditing',
		);
		expect(html).not.toContain('font-display text-xl');
	});

	test('renders dashboard ids in mono and keeps human labels in sans', () => {
		const html = renderDashboardRows();

		expect(html).toMatch(/class="[^"]*font-mono[^"]*"[^>]*>checkout-webhook-issuer</u);
		expect(html).toMatch(/class="[^"]*font-mono[^"]*"[^>]*>aidd</u);
		expect(html).toMatch(/class="[^"]*text-accent[^"]*"[^>]*>Checkout Webhook Issuer</u);
		expect(html).toMatch(
			/class="[^"]*bg-muted font-semibold[^"]*"><div class="[^"]*">Fleet total</u,
		);
		expect(html).not.toMatch(/class="[^"]*font-mono[^"]*"[^>]*>Fleet total</u);
	});
});
