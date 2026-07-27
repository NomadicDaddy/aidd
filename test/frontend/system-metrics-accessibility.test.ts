import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

interface RenderedStates {
	errors: string;
	loading: string;
	success: string;
}

function renderSystemMetricsStates(): RenderedStates {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { SystemMetricsContent } from './src/pages/settings/SystemMetricsSection.tsx';",
		'const response = { current: { activeConnections: 2, cpuUsage: 12.34, diskUsage: 45.67, eventLoopLatency: 4.567, heapTotal: 2_000, heapUsed: 1_000, memoryUsage: 23.45, requestCount: 1234, rss: 3_000, timestamp: 1 }, history: [], latest: null };',
		'const vitalRows = [{ average: 20.25, latest: 19.75, latestRating: "good", name: "INP", sampleCount: 2, threshold: 200 }];',
		'const render = (metrics, vitals) => renderToStaticMarkup(createElement(SystemMetricsContent, { metrics, vitals }));',
		'console.log(JSON.stringify({',
		'errors: render({ data: undefined, isError: true }, { data: undefined, isError: true }),',
		'loading: render({ data: undefined, isError: false }, { data: undefined, isError: false }),',
		'success: render({ data: response, isError: false }, { data: vitalRows, isError: false }),',
		'}));',
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
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedStates;
}

describe('System metrics asynchronous status semantics', () => {
	const states = renderSystemMetricsStates();

	test('announces both initial loading states politely', () => {
		expect((states.loading.match(/role="status"/g) ?? []).length).toBe(2);
		expect((states.loading.match(/aria-live="polite"/g) ?? []).length).toBe(2);
		expect(states.loading).toContain('Loading metrics…');
		expect(states.loading).toContain('Loading vitals…');
	});

	test('announces both load failures as alerts', () => {
		expect((states.errors.match(/role="alert"/g) ?? []).length).toBe(2);
		expect(states.errors).toContain('Could not load system metrics.');
		expect(states.errors).toContain('Could not load web vitals.');
	});

	test('keeps successful polling silent and preserves fixed technical precision', () => {
		expect(states.success).not.toContain('aria-live=');
		expect(states.success).not.toContain('role="alert"');
		expect(states.success).not.toContain('role="status"');
		expect(states.success).toContain('12.3%');
		expect(states.success).toContain('4.57 ms');
	});
});
