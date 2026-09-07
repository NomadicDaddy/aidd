import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

interface RenderedStates {
	errors: string;
	invalidHeap: string;
	loading: string;
	success: string;
	unavailableHeap: string;
}

function renderSystemMetricsStates(): RenderedStates {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { SystemMetricsContent } from './src/pages/settings/SystemMetricsSection.tsx';",
		'const response = { current: { activeConnections: 2, cpuUsage: 12.34, diskUsage: 45.67, eventLoopLatency: 4.567, heapTotal: 2_000, heapUsed: 1_000, memoryUsage: 23.45, requestCount: 1234, rss: 3_000, timestamp: 1 }, history: [], latest: null };',
		'const invalidHeapResponse = { ...response, current: { ...response.current, heapTotal: 1_000, heapUsed: 2_000 } };',
		'const unavailableHeapResponse = { ...response, current: { ...response.current, heapTotal: null, heapUsed: null } };',
		'const vitalRows = [{ latest: 19.75, latestRating: "good", name: "INP", p75: 20.25, sampleCount: 2, threshold: 200 }, { latest: 0.04, latestRating: "good", name: "CLS", p75: 0.05, sampleCount: 2, threshold: 0.1 }];',
		'const render = (metrics, vitals) => renderToStaticMarkup(createElement(SystemMetricsContent, { metrics, vitals }));',
		'console.log(JSON.stringify({',
		'errors: render({ data: undefined, isError: true }, { data: undefined, isError: true }),',
		'invalidHeap: render({ data: invalidHeapResponse, isError: false }, { data: vitalRows, isError: false }),',
		'loading: render({ data: undefined, isError: false }, { data: undefined, isError: false }),',
		'success: render({ data: response, isError: false }, { data: vitalRows, isError: false }),',
		'unavailableHeap: render({ data: unavailableHeapResponse, isError: false }, { data: vitalRows, isError: false }),',
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
		expect(states.success).toContain('19.8 ms');
		expect(states.success).toContain('20.3 ms');
		expect(states.success).toContain('200.0 ms');
		expect(states.success).toContain('0.040');
		expect(states.success).toContain('0.050');
		expect(states.success).toContain('0.100');
		expect(states.success).not.toContain('0.100 ms');
		expect(states.success).toContain('Latest sample rating');
		expect(states.success).toContain('P75 within threshold');
	});

	test('rejects an impossible same-sample heap pair instead of presenting it as healthy', () => {
		expect(states.invalidHeap.match(/Unavailable/g)).toHaveLength(2);
		expect(states.invalidHeap).toContain(
			'Heap unavailable: used exceeds total in the same process sample.',
		);
		expect(states.invalidHeap).toContain('role="alert"');
		expect(states.invalidHeap).not.toContain('1.0 kB');
		expect(states.invalidHeap).not.toContain('2.0 kB');
	});

	test('renders an explicit unavailable state when the runtime supplies no heap pair', () => {
		expect(states.unavailableHeap.match(/Unavailable/g)).toHaveLength(2);
		expect(states.unavailableHeap).toContain(
			'Heap unavailable: this runtime did not provide comparable values.',
		);
		expect(states.unavailableHeap).toContain('role="alert"');
	});
});
