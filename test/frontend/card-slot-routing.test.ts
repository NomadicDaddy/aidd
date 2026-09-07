import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function source(relative: string): string {
	return readFileSync(join(FRONTEND_ROOT, 'src', relative), 'utf8');
}

/** Renders a CardHeader carrying both a status chip and a description. */
function renderHeaderWithStatusAndDescription(descriptionClassName?: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Badge } from './src/components/ui/badge.tsx';",
		"import { CardHeader } from './src/components/ui/card.tsx';",
		'const header = createElement(CardHeader, {',
		"\tdescription: 'Next: roadmap',",
		descriptionClassName === undefined
			? ''
			: `\tdescriptionClassName: '${descriptionClassName}',`,
		"\tstatus: createElement(Badge, { tone: 'neutral' }, 'Stage 2/5: Build'),",
		"\ttitle: 'aidd',",
		'});',
		'console.log(renderToStaticMarkup(header));',
	]
		.filter(Boolean)
		.join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('card content routes through the declared slots', () => {
	test('status and description render in different registers, in that order', () => {
		const markup = renderHeaderWithStatusAndDescription();
		const status = markup.indexOf('data-slot="card-header-status"');
		const description = markup.indexOf('Next: roadmap');

		// The mechanism the five surfaces routed around: `status` sits in the title flex row and
		// keeps whatever chip it is given, while `description` is one muted 12px track below the
		// identity. A stage line pushed through `description` with a 14px foreground override
		// gets neither.
		expect(status).toBeGreaterThan(-1);
		expect(markup).toContain('Stage 2/5: Build');
		expect(description).toBeGreaterThan(status);
		expect(markup).toContain('text-xs text-muted-foreground');
	});

	test('a card can keep prose copy in the description slot without inheriting dense type', () => {
		const markup = renderHeaderWithStatusAndDescription('text-sm leading-relaxed');
		const descriptionClass = markup.match(/<p class="([^"]+)">Next: roadmap<\/p>/u)?.[1];

		expect(descriptionClass).toContain('text-sm leading-relaxed');
		expect(descriptionClass).toContain('max-w-[46ch]');
		expect(descriptionClass).not.toContain('text-xs');

		const about = source('pages/about/AboutPage.tsx');
		expect(about).toContain('descriptionClassName="text-sm leading-relaxed"');
		expect(about).not.toContain('<p className={`mt-3 text-sm text-muted-foreground');
	});

	test('the projects stage line is a status chip and the description is a bare string', () => {
		const card = source('pages/projects/ProjectCard.tsx');

		expect(card).toContain('status={');
		expect(card).toContain('<Badge tone="neutral">');
		// Whatever the description slot is handed, it is not a styled span: the slot owns the
		// size and tone, and the stage line used to override both from inside it.
		expect(card).toContain(
			'maturity.nextArtifactLabel ? `Next: ${maturity.nextArtifactLabel}` : undefined',
		);
		expect(card).not.toContain('text-sm font-medium text-foreground');
	});

	test('the two settings integration cards declare their kind through the badge slot', () => {
		const probe = source('pages/settings/SettingsStatusPanels.tsx');
		const form = source('pages/settings/TelegramChannelSection.tsx');

		// One tab, two kinds of card, previously identical in every respect but their prose.
		expect(probe).toContain('badge={<Badge tone="neutral">Read-only</Badge>}');
		expect(form).toContain('badge={<Badge tone="neutral">Configurable</Badge>}');
	});

	test('a recipe card carries one chip cluster immediately after its identity', () => {
		const grid = source('pages/recipes/RecipeGrid.tsx');
		const cardStart = grid.indexOf('export function RecipeCard');
		const cardEnd = grid.indexOf('export function RecipeTable');
		expect(cardStart).toBeGreaterThan(-1);
		expect(cardEnd).toBeGreaterThan(cardStart);
		// The card body only. The imports above it name every chip once more, and the table
		// below it renders the same chips per column by design.
		const cardSource = grid.slice(cardStart, cardEnd);

		// Two clusters of identically styled `plain` chips in two places is a split a reader
		// has to already know in order to read either one. Counting the chip components inside
		// the badge slot rather than in the card at large is what makes the cluster single:
		// moving one back out below the description would leave the count here short.
		const headerEnd = cardSource.indexOf('/>');
		const descriptionStart = cardSource.indexOf('<p\n\t\t\t\tclassName="mb-4');
		expect(headerEnd).toBeGreaterThan(-1);
		expect(descriptionStart).toBeGreaterThan(headerEnd);
		const slot = cardSource.slice(headerEnd, descriptionStart);

		for (const chip of [
			'<RecipeTypeBadge',
			'<RecipeContractBadges',
			'<RecipeStepTypeBadges',
			'<RecipePolicyBadges',
			'recipeStepCountExplainer',
			'recipeParameterCountExplainer',
		]) {
			expect(slot).toContain(chip);
			expect(cardSource.split(chip)).toHaveLength(2);
		}
	});
});
