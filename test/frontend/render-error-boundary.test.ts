import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('deferred recovery UI and blocked-button explanations render through React', async () => {
	const child = Bun.spawn(
		[
			process.execPath,
			'-e',
			`
		import { createElement } from 'react';
		import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
		import { ErrorBoundary } from './src/components/shared/ErrorBoundary.tsx';
		import { Button } from './src/components/ui/button.tsx';
		const boundary = new ErrorBoundary({ children: createElement('p', null, 'healthy') });
		const healthy = renderToStaticMarkup(boundary.render());
		boundary.state = { error: new Error('fixture render failure <details>') };
		const stream = await renderToReadableStream(boundary.render());
		await stream.allReady;
		const blockedStream = await renderToReadableStream(createElement(Button, {
			disabled: true, title: 'This action needs an approved feature',
		}, 'Run feature'));
		await blockedStream.allReady;
		console.log(JSON.stringify({ healthy, failed: await new Response(stream).text(),
			blocked: await new Response(blockedStream).text() }));
	`,
		],
		{
			cwd: resolve(import.meta.dir, '../../frontend'),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(stderr).toBe('');
	expect(exitCode).toBe(0);
	const markup = JSON.parse(stdout) as { blocked: string; failed: string; healthy: string };
	expect(markup.healthy).toBe('<p>healthy</p>');
	expect(markup.failed).toContain('Something went wrong');
	expect(markup.failed).toContain('fixture render failure &lt;details&gt;');
	expect(markup.failed).toMatch(/<button[^>]*>Reload page<\/button>/);
	expect(markup.blocked).toContain('aria-disabled="true"');
	expect(markup.blocked).toContain('This action needs an approved feature');
	expect(markup.blocked).toContain('tabindex="0"');
	expect(markup.blocked).toMatch(/<button[^>]*disabled=""[^>]*>Run feature<\/button>/);
});
