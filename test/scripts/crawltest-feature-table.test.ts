import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import {
	featureFilterSelect,
	featureSearch,
} from '../../scripts/lib/crawltest/feature-filter-controls.ts';
import { filterValueForLabel } from '../../scripts/lib/crawltest/feature-table.ts';

const featureTableSource = readFileSync(
	resolve(import.meta.dir, '../../scripts/lib/crawltest/feature-table.ts'),
	'utf8',
);
class Control {
	readonly id: string;
	readonly visible: boolean;
	constructor(visible: boolean, id = '') {
		this.id = id;
		this.visible = visible;
	}
	getClientRects(): number[] {
		return this.visible ? [1] : [];
	}
}
class Select extends Control {}

function filterFixture(mobile: boolean, dialogOpen: boolean) {
	const hiddenSelect = new Select(false, 'hidden-status');
	const desktopSelect = new Select(!mobile, 'desktop-status');
	const dialogSelect = new Select(dialogOpen, 'dialog-status');
	const hiddenSearch = new Control(false);
	const visibleSearch = Object.assign(new Control(true), { closest: () => toolbar });
	const fields = [hiddenSelect, desktopSelect].map((select) => ({
		htmlFor: select.id,
		textContent: 'Status',
	}));
	const trigger = Object.assign(new Control(mobile), {
		getAttribute: () => 'mobile-panel',
	});
	const panel = Object.assign(new Control(dialogOpen), {
		querySelectorAll: () => [{ htmlFor: dialogSelect.id, textContent: 'Status' }],
	});
	const toolbar = {
		querySelectorAll: (selector: string) =>
			selector.startsWith('button') ? [trigger] : fields,
	};
	const elements = new Map<string, Control>([
		['mobile-panel', panel],
		[desktopSelect.id, desktopSelect],
		[dialogSelect.id, dialogSelect],
		[hiddenSelect.id, hiddenSelect],
	]);
	return {
		context: {
			document: {
				getElementById: (id: string) => elements.get(id) ?? null,
				querySelectorAll: () => [hiddenSearch, visibleSearch],
			},
			getComputedStyle: () => ({ visibility: 'visible' }),
			HTMLElement: Control,
			HTMLSelectElement: Select,
		},
		desktopSelect,
		dialogSelect,
		visibleSearch,
	};
}

describe('crawltest project feature filters', () => {
	test('selects the visible search and desktop Status after hidden duplicates', () => {
		const fixture = filterFixture(false, false);
		expect(runInNewContext(featureSearch, fixture.context)).toBe(fixture.visibleSearch);
		expect(runInNewContext(featureFilterSelect('Status'), fixture.context)).toBe(
			fixture.desktopSelect,
		);
	});

	test('requires the mobile dialog to open before selecting its visible Status', () => {
		const closed = filterFixture(true, false);
		expect(runInNewContext(featureFilterSelect('Status'), closed.context)).toBeNull();
		const opened = filterFixture(true, true);
		expect(runInNewContext(featureFilterSelect('Status'), opened.context)).toBe(
			opened.dialogSelect,
		);
	});

	test('does not substitute another control when the requested label is missing', () => {
		const fixture = filterFixture(false, false);
		expect(runInNewContext(featureFilterSelect('Source'), fixture.context)).toBeNull();
	});

	test('maps human-readable row labels back to raw filter values', () => {
		const options = [
			{ label: 'Waiting approval', value: 'waiting_approval' },
			{ label: 'Audit: Complication', value: 'Audit: COMPLICATION' },
		];

		expect(filterValueForLabel(options, 'Waiting approval')).toBe('waiting_approval');
		expect(filterValueForLabel(options, 'Audit: Complication')).toBe('Audit: COMPLICATION');
		expect(filterValueForLabel(options, 'Missing')).toBe('');
		expect(featureTableSource).toContain("label: option.textContent?.trim() ?? ''");
	});
});
