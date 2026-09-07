import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

interface ValidationRender {
	enabled: boolean;
	message: null | string;
	requests: string[][];
}

/** Drive the real query with a controlled debounce snapshot in an isolated module registry. */
function renderValidation(current: string[], settled: string[], seeded = true): ValidationRender {
	const script = `
import { mock } from 'bun:test';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const current = ${JSON.stringify(current)};
const settled = ${JSON.stringify(settled)};
mock.module('./src/hooks/useDebouncedValue.ts', () => ({ useDebouncedValue: () => settled }));
const { useApplicationRootsValidation } = await import('./src/hooks/useSettings.ts');
const requests = [];
globalThis.fetch = async (_url, options) => {
	requests.push(JSON.parse(options.body).applicationRoots);
	return Response.json({ valid: true });
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let message = null;
function Probe() {
	message = useApplicationRootsValidation(current, ${String(seeded)});
	return null;
}
renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
const query = client.getQueryCache().getAll()[0];
const observer = new QueryObserver(client, query.options);
const unsubscribe = observer.subscribe(() => {});
await new Promise((resolve) => setTimeout(resolve, 20));
console.log(JSON.stringify({ enabled: query.options.enabled, message, requests }));
unsubscribe();
client.clear();
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as ValidationRender;
}

describe('Settings root validation request readiness', () => {
	test('does not send the blank debounce snapshot when saved roots seed the form', () => {
		const result = renderValidation(['D:/applications'], ['']);
		expect(result.enabled).toBe(false);
		expect(result.requests).toEqual([]);
		expect(result.message).toBe('Checking application roots…');
	});

	test('does not start validation for the previous root during a rapid edit', () => {
		const result = renderValidation(['D:/new'], ['D:/old']);
		expect(result.requests).toEqual([]);
		expect(result.message).toBe('Checking application roots…');
	});

	test('starts the real request once the current roots settle', () => {
		const result = renderValidation(['D:/applications'], ['D:/applications']);
		expect(result.enabled).toBe(true);
		expect(result.requests).toEqual([['D:/applications']]);
	});

	test('keeps invalid input local and blocks saving with its specific reason', () => {
		const result = renderValidation(['relative'], ['D:/applications']);
		expect(result.requests).toEqual([]);
		expect(result.message).toContain('is relative');
	});

	test('does not validate before the form has been seeded', () => {
		const result = renderValidation(['D:/applications'], ['D:/applications'], false);
		expect(result.requests).toEqual([]);
		expect(result.message).toBeNull();
	});
});
