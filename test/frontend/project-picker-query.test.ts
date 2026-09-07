import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('the rendered names hook participates in project mutation invalidation', () => {
	const script = `
		import { createElement } from 'react';
		import { renderToStaticMarkup } from 'react-dom/server';
		import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
		import { useProjectNames } from './src/hooks/useProjects.ts';
		import { invalidateProjectQueries } from './src/hooks/useProjectsShared.ts';
		const client = new QueryClient();
		function Picker() { useProjectNames(); return null; }
		renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Picker)));
		const query = client.getQueryCache().getAll()[0];
		if (!query) throw new Error('The picker did not register its query');
		client.setQueryData(query.queryKey, { projects: [] });
		invalidateProjectQueries(client);
		console.log(JSON.stringify({ key: query.queryKey, invalidated: query.state.isInvalidated }));
		client.clear();
	`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		windowsHide: true,
	});
	expect(result.exitCode).toBe(0);
	const output = JSON.parse(result.stdout.toString()) as { key: string[]; invalidated: boolean };
	expect(output.key).toEqual(['projects', 'names']);
	expect(output.invalidated).toBe(true);
});
