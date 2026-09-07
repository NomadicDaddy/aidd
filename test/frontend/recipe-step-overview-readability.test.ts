import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
	RecipeConfigValue,
	RecipeDefinition,
	RecipeStepDefinition,
	RecipeStepType,
} from '../../frontend/src/api/types.ts';

function renderStep(
	stepType: RecipeStepType,
	configJson: Record<string, RecipeConfigValue>,
	overrides: Partial<RecipeStepDefinition> = {},
): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { StepOverviewCard } from './src/pages/recipes/StepOverviewCard.tsx';",
		`const step = ${JSON.stringify({
			configJson,
			id: 'snapshot-ui',
			name: 'Snapshot pre-apply UI',
			stepType,
			...overrides,
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

const command =
	'if [ -n "$(git status --porcelain)" ]; then echo "refusing to run"; exit 1; fi; git worktree add --detach .worktrees/ui-reference HEAD';

function renderShellStep(): string {
	return renderStep('shell', { command });
}

/**
 * The `class` of the `<code>` block that follows a given label. Each block entry renders its label
 * in its own div and the value in the next `<code>`, so the class this returns is the treatment
 * that one value got — not whichever treatment happens to appear first in the card.
 */
function blockClassFor(markup: string, label: string): string {
	const labelAt = markup.indexOf(`>${label}:<`);
	if (labelAt < 0) throw new Error(`no block labelled ${label} in the markup`);
	const codeAt = markup.indexOf('<code class="', labelAt);
	if (codeAt < 0) throw new Error(`no code block after ${label}`);
	const from = codeAt + '<code class="'.length;
	return markup.slice(from, markup.indexOf('"', from));
}

describe('recipe step overview readability', () => {
	test('renders commands in a separately labelled, wrapping code region', () => {
		const markup = renderShellStep();
		const commandLabel = markup.indexOf('Command:');
		const codeRegion = markup.indexOf('<code');

		expect(commandLabel).toBeGreaterThan(-1);
		expect(codeRegion).toBeGreaterThan(commandLabel);
		expect(markup).toContain('font-mono');
		expect(markup).toContain('whitespace-pre-wrap');
		expect(markup).not.toMatch(/inline-flex[^>]*>\s*<span[^>]*>Command:/);
	});

	test('a command wraps without creating a nested horizontal scrollport', () => {
		const markup = renderShellStep();
		const classes = blockClassFor(markup, 'Command');

		expect(classes.split(' ')).toContain('whitespace-pre-wrap');
		expect(classes.split(' ')).toContain('[overflow-wrap:anywhere]');
		expect(classes.split(' ')).not.toContain('whitespace-pre');
		expect(markup).not.toContain('data-overflow-scroller');
	});

	test('a prompt wraps into the column instead of scrolling sideways', () => {
		// Long enough to be a block, and prose rather than a command line: this is what
		// `whitespace-pre` was turning into a horizontal scrollport one paragraph wide.
		const prompt =
			'Review the diff for correctness first, then for clarity. Name the file and line of every finding, and say plainly when you are unsure rather than hedging the sentence.';
		const classes = blockClassFor(renderStep('aidd-cli', { prompt }), 'Prompt').split(' ');

		expect(classes).toContain('whitespace-pre-wrap');
		expect(classes).toContain('break-words');
		// The two that make it scroll rather than wrap. Both have to be gone, not just the one.
		expect(classes).not.toContain('whitespace-pre');
		expect(classes).not.toContain('overflow-x-auto');
	});

	test('a chip narrowed to one column loses its edge, not the part that identifies it', () => {
		// Two skill ids that are the same for their first fourteen characters. `truncate` cuts the
		// tail, so at 358px both chips read `frontend-design…` and the chip stops saying which step
		// this is — the one thing it exists to say.
		const markup = renderStep('skill', { skillId: 'frontend-design-sweep' });
		const value = markup.slice(markup.indexOf('Skill:'));

		expect(value).toContain('frontend-design-sweep');
		expect(value).toContain('font-mono break-words text-foreground');
		expect(value).not.toContain('truncate');
		// The full value stays reachable for a pointer even when the pill wraps.
		expect(markup).toContain('title="Skill: frontend-design-sweep"');
	});

	test('an entry is separated from the next by more than its own label is from its value', () => {
		const markup = renderStep('shell', { command, cwd: 'frontend' });

		// One 358px column turns every block entry into a full-width stack, so proximity is the only
		// thing left saying which label owns which value. `space-y-2` between entries against `mb-1`
		// inside one was too near an even gap to read as a grouping.
		expect(markup).toContain('min-w-0 space-y-3');
		expect(markup).toContain('mb-1 text-xs font-medium text-muted-foreground');
	});

	test('renders the bundled apply-ui destructive post-hook as executable behavior', async () => {
		const recipeSource = await readFile(
			resolve(import.meta.dir, '../../recipes/apply-ui.json'),
			'utf8',
		);
		const recipe = JSON.parse(recipeSource) as RecipeDefinition;
		const parityStep = recipe.steps.find((step) => step.name === 'Check UI parity');
		expect(parityStep).toBeDefined();
		if (!parityStep) throw new Error('Expected the apply-ui parity step');

		const markup = renderStep(parityStep.stepType, parityStep.configJson, parityStep);
		expect(markup).toContain('After step hook');
		expect(markup).toContain(
			'git worktree remove --force .worktrees/ui-reference; git worktree prune',
		);
	});

	test('renders pre-hooks and conditions, but no empty behavior sections', () => {
		const markup = renderStep(
			'shell',
			{ command: 'bun run build' },
			{
				preHookJson: { command: 'bun run prepare' },
				when: { equals: 'false', parameter: 'stopBeforeImplementation' },
			},
		);

		expect(markup).toContain('Before step hook');
		expect(markup).toContain('bun run prepare');
		expect(markup).toContain('Run condition');
		expect(markup).toContain('stopBeforeImplementation');
		expect(markup).toContain('false');

		const unconditionalMarkup = renderShellStep();
		expect(unconditionalMarkup).not.toContain('Before step hook');
		expect(unconditionalMarkup).not.toContain('After step hook');
		expect(unconditionalMarkup).not.toContain('Run condition');
	});

	test('keeps the card, connector, number bubble, and config treatment on semantic tokens', async () => {
		const source = await readFile(
			resolve(import.meta.dir, '../../frontend/src/pages/recipes/StepOverviewCard.tsx'),
			'utf8',
		);
		// The number bubble and the spine moved into `RecipeStepMarker`, which the step *editor*
		// now draws too — the ordering device was missing from the one mode that reorders steps.
		// Both files are checked, because the tokens have to survive in the shared component.
		const marker = await readFile(
			resolve(import.meta.dir, '../../frontend/src/pages/recipes/RecipeStepMarker.tsx'),
			'utf8',
		);

		expect(source).toContain('<Card className={`min-w-0 p-3 ${split}`} variant="sunken">');
		expect(marker).toContain(
			'border-control-border bg-muted text-xs font-bold text-foreground',
		);
		expect(marker).toContain('w-px flex-1 bg-control-border');
		expect(marker).not.toMatch(/(?:bg|text|border)-(?:teal|neutral)-/);
		expect(source).toContain('border-border bg-muted');
		// The config chips do not fork on an emphasis flag to render half of themselves in
		// `bg-accent-muted`, which is the tone the app spends on live state. They are one neutral
		// treatment, so what is asserted here is that one — still a semantic token.
		expect(source).toContain('rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground');
		expect(source).not.toContain('bg-accent-muted');
		expect(source).not.toMatch(/(?:bg|text|border)-(?:teal|neutral)-/);
		expect(source).not.toContain('dark:');
	});
});
