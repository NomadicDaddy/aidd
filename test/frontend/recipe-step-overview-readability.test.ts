import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function renderShellStep(): string {
	const command =
		'if [ -n "$(git status --porcelain)" ]; then echo "refusing to run"; exit 1; fi; git worktree add --detach .worktrees/ui-reference HEAD';
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { StepOverviewCard } from './src/pages/recipes/StepOverviewCard.tsx';",
		`const step = ${JSON.stringify({
			configJson: { command },
			id: 'snapshot-ui',
			name: 'Snapshot pre-apply UI',
			stepType: 'shell',
		})};`,
		'console.log(renderToStaticMarkup(createElement(StepOverviewCard, { isLast: false, step, stepNumber: 1 })));',
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

describe('recipe step overview readability', () => {
	test('renders commands in a separately labelled, scrollable code region', () => {
		const markup = renderShellStep();
		const commandLabel = markup.indexOf('command:');
		const codeRegion = markup.indexOf('<code');

		expect(commandLabel).toBeGreaterThan(-1);
		expect(codeRegion).toBeGreaterThan(commandLabel);
		expect(markup).toContain('overflow-x-auto');
		expect(markup).toContain('font-mono');
		expect(markup).toContain('whitespace-pre');
		expect(markup).not.toMatch(/inline-flex[^>]*>\s*<span[^>]*>command:/);
	});

	test('keeps the card, connector, number bubble, and config treatment on semantic tokens', async () => {
		const source = await readFile(
			resolve(import.meta.dir, '../../frontend/src/pages/recipes/StepOverviewCard.tsx'),
			'utf8',
		);

		expect(source).toContain('<Card className="min-w-0 p-3">');
		expect(source).toContain('bg-accent text-xs font-bold text-accent-foreground');
		expect(source).toContain('w-px flex-1 bg-border');
		expect(source).toContain('border-border bg-muted');
		// The config chips used to fork on an emphasis flag and render half of themselves in
		// `bg-accent-muted`, which is the tone the app spends on live state. They are one neutral
		// treatment now, so what is asserted here is the surviving one — still a semantic token.
		expect(source).toContain('rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground');
		expect(source).not.toContain('bg-accent-muted');
		expect(source).not.toMatch(/(?:bg|text|border)-(?:teal|neutral)-/);
		expect(source).not.toContain('dark:');
	});
});
