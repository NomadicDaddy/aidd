import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { orphanedLastCardIndex } from '../../frontend/src/pages/dashboard/dashboard-shared.ts';
import { milestoneBadgeTone } from '../../frontend/src/pages/projects/projects-list-visuals.ts';
import { DASHBOARD_CARD_IDS } from '../../frontend/src/stores/dashboardStore.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// A comment that explains why a class or an id was removed contains that class or id, so a test
// asserting absence has to read the code without the prose about it.
function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

async function exists(relativePath: string): Promise<boolean> {
	return Bun.file(join(frontendSource, ...relativePath.split('/'))).exists();
}

describe('a dashboard number is stated once', () => {
	test('Fleet Health is not a second card printing the Priority Health percentage', async () => {
		expect(await exists('pages/dashboard/FleetHealthCard.tsx')).toBe(false);
		expect(DASHBOARD_CARD_IDS as readonly string[]).not.toContain('fleet-health');
		expect(stripComments(await read('pages/dashboard/DashboardPage.tsx'))).not.toContain(
			'FleetHealthCard',
		);
	});

	test('the bar and the band the Fleet Health card owned live in the Priority Health tile', async () => {
		const page = await read('pages/dashboard/DashboardPage.tsx');
		const footer = await read('pages/dashboard/PriorityHealthFooter.tsx');

		// `footer` is the Metric slot for full-width content below the caption; the bar and the
		// band badge are the only things the deleted card had that the tile did not.
		expect(page).toContain('label="Priority Health"');
		expect(page).toContain('footer={\n\t\t\t\t\t\t<PriorityHealthFooter');
		expect(footer).toContain('healthBandLabel(band)');
		expect(footer).toContain('toneSolid[tone]');
	});

	test('Active Runs drops its count badge because the tile above states the count', async () => {
		const source = stripComments(await read('pages/dashboard/ActiveRunsCard.tsx'));

		expect(source).not.toContain('badge=');
		expect(source).not.toContain('{activeRuns.length}</Badge>');
	});
});

describe('machine values are not printed in the body face', () => {
	test('the Feature Status state column reads as prose', async () => {
		const source = await read('pages/dashboard/FeatureStatusCard.tsx');

		expect(source).toContain("import { humanizeEnum } from '../../lib/formatters.ts'");
		expect(source).toContain('humanizeEnum(row.completed');
		// The Type column carried a Badge whose value was identical on every visible row.
		expect(source).not.toContain('{row.type}');
	});

	test('humanizeEnum is shared, not a Director-local helper', async () => {
		const formatters = await read('lib/formatters.ts');
		const directorUtils = stripComments(await read('pages/director/directorUtils.ts'));

		expect(formatters).toContain('export function humanizeEnum');
		expect(directorUtils).not.toContain('humanizeEnum');
	});

	test('humanizeEnum turns both enum shapes into a sentence', async () => {
		const { humanizeEnum } = await import('../../frontend/src/lib/formatters.ts');

		expect(humanizeEnum('waiting_approval')).toBe('Waiting approval');
		expect(humanizeEnum('RUN_AUDIT')).toBe('Run audit');
		expect(humanizeEnum('')).toBe('');
	});
});

describe('milestone chips differ by presence of colour, not by two adjacent greens', () => {
	test('only a complete milestone is toned', () => {
		expect(milestoneBadgeTone({ completed: 5, total: 5 })).toBe('emerald');
		expect(milestoneBadgeTone({ completed: 3, total: 5 })).toBe('neutral');
		expect(milestoneBadgeTone({ completed: 0, total: 5 })).toBe('neutral');
		// An empty milestone is not vacuously complete.
		expect(milestoneBadgeTone({ completed: 0, total: 0 })).toBe('neutral');
	});
});

describe('the last grid row does not leave a dead column', () => {
	test('a card alone on the final row is reported', () => {
		expect(orphanedLastCardIndex([])).toBeNull();
		expect(orphanedLastCardIndex([false])).toBe(0);
		expect(orphanedLastCardIndex([false, false])).toBeNull();
		expect(orphanedLastCardIndex([false, false, false])).toBe(2);
		// A full-width card takes a row to itself and resets the column, so the parity of the
		// count alone cannot answer this.
		expect(orphanedLastCardIndex([false, false, true])).toBeNull();
		expect(orphanedLastCardIndex([false, true, false])).toBe(2);
		expect(orphanedLastCardIndex([false, false, false, true, false, false, false])).toBe(6);
	});

	test('the grid stretches that card without rewriting what the operator chose', async () => {
		const grid = await read('pages/dashboard/SortableDashboardGrid.tsx');
		const card = await read('pages/dashboard/SortableDashboardCard.tsx');

		expect(grid).toContain('orphanedLastCardIndex(');
		expect(grid).toContain('stretch={index === orphanIndex}');
		// `stretch` widens the render; `isFull` remains what the width toggle reads and stores.
		expect(card).toContain("(isFull || stretch) && 'xl:col-span-2'");
		expect(card).toContain("setCardWidth(card.id, isFull ? 'half' : 'full')");
	});
});
