import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SRC = join(FRONTEND_ROOT, 'src');

function source(relativePath: string): string {
	return readFileSync(join(SRC, relativePath), 'utf8');
}

function tsxFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...tsxFiles(full));
		else if (entry.name.endsWith('.tsx')) out.push(full);
	}
	return out;
}

/** Lines where a JSX element is handed the `interactive` prop, however it is spelled. */
function interactiveAttributeCount(src: string): number {
	let count = 0;
	for (const raw of src.split('\n')) {
		const line = raw.trim();
		if (line === 'interactive' || line === 'interactive>' || line.startsWith('interactive={'))
			count += 1;
	}
	return count;
}

/** The file on one line, so a check can name adjacent tokens prettier is free to rewrap. */
function flatten(src: string): string {
	return src.split(/\s+/u).join(' ');
}

/** True when `at` falls inside an unclosed <Link> or <button>, i.e. inside a real click target. */
function insideClickTarget(src: string, at: number): boolean {
	const head = src.slice(0, at);
	const opener = Math.max(head.lastIndexOf('<Link'), head.lastIndexOf('<button'));
	const closer = Math.max(head.lastIndexOf('</Link>'), head.lastIndexOf('</button>'));
	return opener > -1 && opener > closer;
}

// Every file allowed to hand a Card the interactive affordance, and how many times. card.tsx
// declares the prop and Metric.tsx forwards it; neither decides anything, so both are excluded
// from the census below rather than listed here.
const CALL_SITES: Record<string, number> = {
	'pages/dashboard/DashboardMetrics.tsx': 4,
	'pages/projects/detail/OverviewSummary.tsx': 1,
	'pages/telemetry/TelemetrySummary.tsx': 1,
};

/**
 * Call sites whose card is wrapped in a link only under a condition, and the condition.
 *
 * The Projects tile's failed state carries a Retry button, which cannot sit inside a Link, so
 * the tile is held in a variable and the wrapper is applied around it conditionally. Lexical
 * containment cannot see that, but the claim is unchanged and still checkable: `interactive={G}`
 * is honest exactly when the tree reads `{G ? (<Link` for the same G. A site listed here that
 * stops wrapping itself fails on the wrapper check rather than passing on the exemption.
 */
const CONDITIONAL_CALL_SITES: Record<string, string> = {
	'pages/dashboard/DashboardMetrics.tsx': 'projectsReading !== null',
};

describe('a card advertises interactivity only when the whole card is a click target', () => {
	test('the prop is what draws the lift, so passing it is a claim about the pointer', () => {
		const card = source('components/ui/card.tsx');

		// The affordance is one conditional, so `interactive` is not decoration: it is the whole
		// hover contract. A card that carries it and does nothing on click has lied to the pointer.
		expect(card).toContain('interactive && ');
		expect(card).toContain('card-hover hover:border-accent/40');
	});

	test('only the surfaces whose card is inside a link or a button pass it', () => {
		const census: Record<string, number> = {};
		for (const file of tsxFiles(SRC)) {
			const rel = relative(SRC, file).split('\\').join('/');
			if (rel === 'components/ui/card.tsx' || rel === 'components/shared/Metric.tsx')
				continue;
			const count = interactiveAttributeCount(readFileSync(file, 'utf8'));
			if (count > 0) census[rel] = count;
		}

		// A census rather than a spot check, because the failure mode is a new card picking the
		// prop up for the look of it. Adding a row here means asserting the card navigates.
		expect(census).toEqual(CALL_SITES);
	});

	test('each call site sits inside the element that handles the click', () => {
		for (const [rel, expected] of Object.entries(CALL_SITES)) {
			const src = source(rel);
			let offset = 0;
			let found = 0;
			for (const raw of src.split('\n')) {
				const line = raw.trim();
				const isAttribute =
					line === 'interactive' ||
					line === 'interactive>' ||
					line.startsWith('interactive={');
				if (isAttribute) {
					found += 1;
					const guard = CONDITIONAL_CALL_SITES[rel];
					if (guard !== undefined && line === `interactive={${guard}}`) {
						expect(flatten(src)).toContain(`{${guard} ? ( <Link`);
					} else {
						expect(insideClickTarget(src, offset)).toBe(true);
					}
				}
				offset += raw.length + 1;
			}
			expect(found).toBe(expected);
		}
	});

	test('the two catalog cards that are not click targets keep their links instead', () => {
		const recipe = source('pages/recipes/RecipeGrid.tsx');
		const project = source('pages/projects/ProjectCard.tsx');

		// The recipes card used to carry the prop while only its title and its Details action
		// navigated, so the whole card lifted under the pointer and then swallowed the click
		// everywhere but on those two words. The projects card was filed alongside it as the
		// opposite defect, but it is not a click target either: ProjectsCardView records the
		// decision to navigate from a real link on the name rather than a stretched overlay that
		// in-flow card content would intercept. Neither card gets the affordance; both keep the link.
		expect(interactiveAttributeCount(recipe)).toBe(0);
		expect(interactiveAttributeCount(project)).toBe(0);
		// The card names two navigation targets: the title in the header slot, and Details.
		expect(recipe).toContain('title={recipe.name}');
		expect(recipe).toContain('aria-label={`View details for ${recipe.name}`}');
		expect(recipe).toContain('to={`/recipes/${recipe.id}`}>');
		expect(project).toContain('<Link');
		expect(source('pages/projects/ProjectsCardView.tsx')).toContain(
			'The project name is the navigation target',
		);
	});
});
