import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { BackendDefaultSettings } from '../../frontend/src/api/types.ts';

import {
	backendDefaultsEqual,
	backendHasLocalDefaults,
	effectiveBackendModel,
	focusBackendDisclosureTrigger,
	nextBackendDisclosureExpanded,
} from '../../frontend/src/pages/settings/backendDefaultDisclosure.ts';
import { emptyBackendDefault } from '../../frontend/src/pages/settings/settingsUtils.ts';

function renderDisclosure(defaults: BackendDefaultSettings): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { BackendDefaultsDisclosureRow } from './src/pages/settings/BackendDefaultsDisclosureRow.tsx';",
		`const defaults = ${JSON.stringify(defaults)};`,
		'console.log(renderToStaticMarkup(createElement(BackendDefaultsDisclosureRow, {',
		" backend: 'codex', defaults, identity: createElement('span', null, 'codex installed'),",
		' savedDefaults: defaults, setBackendDefault: () => {}, sharedModel: "gpt-5.6-sol"',
		'})));',
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

describe('Settings mobile backend disclosures', () => {
	test('summarizes status, effective model, and local-default state while collapsed', () => {
		const defaults = { ...emptyBackendDefault(), model: 'gpt-5.6-sol' };
		const html = renderDisclosure(defaults);

		expect(html).toContain('aria-expanded="false"');
		expect(html).toMatch(/aria-controls="[^"]+" aria-expanded="false"/u);
		expect(html).toContain('transition-colors duration-150 hover:bg-muted/40');
		expect(html).toContain(
			'focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none focus-visible:ring-inset',
		);
		expect(html).toContain('codex installed');
		expect(html).toContain('Model: gpt-5.6-sol');
		expect(html).toContain('Local defaults');
		expect(html).not.toContain('codex model');
	});

	test('reports inherited and backend-provided effective models precisely', () => {
		const defaults = emptyBackendDefault();

		expect(backendHasLocalDefaults(defaults)).toBe(false);
		expect(effectiveBackendModel(defaults, 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
		expect(effectiveBackendModel(defaults, null)).toBe('CLI default');
		expect(effectiveBackendModel({ ...defaults, model: 'openai/gpt-5.6-sol' }, 'shared')).toBe(
			'openai/gpt-5.6-sol',
		);
	});

	test('keeps a row open while it differs from the saved backend', () => {
		const saved = emptyBackendDefault();
		const edited = { ...saved, idleTimeoutSeconds: 300 };

		expect(backendDefaultsEqual(edited, saved)).toBe(false);
		expect(nextBackendDisclosureExpanded(false, false)).toBe(true);
		expect(nextBackendDisclosureExpanded(true, true)).toBe(true);
		expect(nextBackendDisclosureExpanded(true, false)).toBe(false);
	});

	test('returns focus to the disclosure trigger without moving the scrollport', () => {
		let received: FocusOptions | undefined;
		const trigger = {
			focus: (options?: FocusOptions) => {
				received = options;
			},
		};

		focusBackendDisclosureTrigger(trigger);

		expect(received).toEqual({ preventScroll: true });
	});
});

describe('Settings toolbar and matrix breakpoints', () => {
	test('waits for saved settings before rendering editable backend defaults', async () => {
		const source = await Bun.file(
			resolve(import.meta.dir, '../../frontend/src/pages/settings/SettingsPage.tsx'),
		).text();

		expect(source).toContain('const [formSeeded, setFormSeeded] = useState(false)');
		expect(source).toMatch(
			/setForm\(normalizeIgnoredFolders\(settings\.data\)\);\s+setFormSeeded\(true\);/u,
		);
		expect(source).toContain('settings.isLoading || (!settings.isError && !formSeeded)');
	});

	test('releases the full toolbar from the mobile scrollport only below sm', async () => {
		const source = await Bun.file(
			resolve(import.meta.dir, '../../frontend/src/pages/settings/SettingsToolbar.tsx'),
		).text();

		expect(source).toContain('sm:sticky');
		expect(source).toContain('sm:top-[var(--app-topbar-height,0px)]');
		expect(source).not.toMatch(/className="sticky\b/u);
	});

	test('uses disclosures only below the retained two-column card threshold', async () => {
		const source = await Bun.file(
			resolve(import.meta.dir, '../../frontend/src/pages/settings/BackendDefaultsTable.tsx'),
		).text();

		expect(source).toContain('space-y-2 p-3 @min-[32rem]:hidden');
		expect(source).toContain('@min-[32rem]:grid-cols-2');
		expect(source).toContain('@min-[61rem]:block');
	});
});
