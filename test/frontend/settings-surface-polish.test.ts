import type { SettingsSourceControlStatus } from '../../frontend/src/api/types.ts';

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	dirtySettingsTabs,
	readOnlySettingsKeys,
	settingsTabKeys,
} from '../../frontend/src/pages/settings/settingsDirtyTabs.ts';
import { createBlankSettings } from '../../frontend/src/pages/settings/settingsUtils.ts';
import { sourceControlRowTone } from '../../frontend/src/pages/settings/sourceControlTone.ts';

function render(imports: string, expression: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		imports,
		`console.log(renderToStaticMarkup(${expression}));`,
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

function sourceControlItem(
	overrides: Partial<SettingsSourceControlStatus>,
): SettingsSourceControlStatus {
	return {
		authStatus: null,
		command: 'git',
		detail: 'Available',
		id: 'git',
		label: 'Git',
		status: 'available',
		version: '2.47.0',
		...overrides,
	};
}

describe('settings dirty-tab locator', () => {
	test('reports no dirty tab before the saved settings arrive', () => {
		expect(dirtySettingsTabs(createBlankSettings(), undefined).size).toBe(0);
	});

	test('lights only the tab that owns the changed key', () => {
		const saved = createBlankSettings();
		const form = { ...saved, quitOnAbort: 7 };

		expect([...dirtySettingsTabs(form, saved)]).toEqual(['run-engine']);
	});

	test('lights every tab that owns a changed key', () => {
		const saved = createBlankSettings();
		const form = { ...saved, applicationsRoot: 'D:/apps', port: 4100 };

		expect([...dirtySettingsTabs(form, saved)].sort()).toEqual(['control-panel', 'workspace']);
	});

	test('ignores an ignoredFolders difference the toolbar does not call dirty', () => {
		// The page-level dirty check normalizes ignoredFolders (blank entries are dropped before
		// comparison). A tab dot that fired on a blank row would point at a tab whose Save is a
		// no-op, so the locator has to normalize through the same helper.
		const saved = createBlankSettings();
		saved.ignoredFolders = ['node_modules'];
		const form = { ...saved, ignoredFolders: ['node_modules', '  '] };

		expect(dirtySettingsTabs(form, saved).size).toBe(0);
	});

	test('assigns every settings key to a tab or to the read-only list', () => {
		// A key in neither list silently never lights a dot — the exact failure the map prevents.
		const owned = new Set<string>([
			...Object.values(settingsTabKeys).flat(),
			...readOnlySettingsKeys,
		]);

		expect(Object.keys(createBlankSettings()).filter((key) => !owned.has(key))).toEqual([]);
	});

	test('never assigns one key to two tabs', () => {
		const assigned = Object.values(settingsTabKeys).flat();

		expect(assigned).toHaveLength(new Set(assigned).size);
	});
});

describe('source-control row tone', () => {
	test('stays emerald for an installed, authenticated tool', () => {
		expect(
			sourceControlRowTone(sourceControlItem({ authStatus: 'Authenticated as nomad' })),
		).toBe('emerald');
	});

	test('drops to amber when an installed tool is not signed in', () => {
		expect(
			sourceControlRowTone(
				sourceControlItem({
					authStatus: "Not authenticated: ERROR: Please run 'az login'",
					status: 'available',
				}),
			),
		).toBe('amber');
	});

	test('keeps the worse tone when a missing tool also lacks auth', () => {
		expect(sourceControlRowTone(sourceControlItem({ status: 'unavailable' }))).toBe('red');
		expect(sourceControlRowTone(sourceControlItem({ status: 'missing' }))).toBe('amber');
	});

	test('treats an absent auth probe as authenticated rather than as a failure', () => {
		expect(sourceControlRowTone(sourceControlItem({ authStatus: null }))).toBe('emerald');
	});
});

describe('backend defaults table alignment', () => {
	test('emits one cell per control so each sits under its own header', () => {
		// The four controls used to share a single `<td colSpan={4}>` with a private grid, which
		// laid out independently of the header row — every `<th>` sat left of the control it named.
		const html = render(
			"import { BackendDefaultFields } from './src/pages/settings/BackendDefaultFields.tsx';",
			`createElement(
				'table',
				null,
				createElement(
					'tbody',
					null,
					createElement(
						'tr',
						null,
						createElement(BackendDefaultFields, {
							backend: 'codex',
							defaults: {
								idleNudgeTimeoutSeconds: null,
								idleTimeoutSeconds: null,
								model: null,
								reasoningEffort: null,
							},
							layout: 'cells',
							setBackendDefault: () => {},
						}),
					),
				),
			)`,
		);

		expect(html.match(/<td\b/g)).toHaveLength(4);
		expect(html).not.toContain('colspan');
	});

	test('emits plain divs in the stacked mobile layout', () => {
		const html = render(
			"import { BackendDefaultFields } from './src/pages/settings/BackendDefaultFields.tsx';",
			`createElement(BackendDefaultFields, {
				backend: 'codex',
				defaults: {
					idleNudgeTimeoutSeconds: null,
					idleTimeoutSeconds: null,
					model: null,
					reasoningEffort: null,
				},
				setBackendDefault: () => {},
			})`,
		);

		expect(html).not.toContain('<td');
		expect(html.match(/<div\b/g)).toHaveLength(4);
	});
});

describe('settings toolbar unsaved locator', () => {
	function renderToolbar(dirtyTabs: string[]): string {
		return render(
			"import { SettingsToolbar } from './src/pages/settings/SettingsToolbar.tsx';",
			`createElement(SettingsToolbar, {
				activeTab: 'workspace',
				dirty: true,
				dirtyTabs: new Set(${JSON.stringify(dirtyTabs)}),
				onChange: () => {},
				onDiscard: () => {},
				onSave: () => {},
				saveBlockReason: null,
				savePending: false,
			})`,
		);
	}

	test('marks each dirty tab trigger and its mobile option', () => {
		const html = renderToolbar(['run-engine']);

		expect(html.match(/unsaved changes/g)).toHaveLength(1);
		expect(html).toContain('Run Engine • unsaved');
		expect(html).not.toContain('Workspace • unsaved');
	});

	test('renders no dot when nothing is pending', () => {
		const html = renderToolbar([]);

		expect(html).not.toContain('unsaved');
	});
});

describe('settings help text stays out of the accessible name', () => {
	test('associates the Applications Root hint by aria-describedby, not by nesting', () => {
		const html = render(
			"import { SettingsSectionTabs } from './src/pages/settings/SettingsSectionTabs.tsx';\n" +
				"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';",
			`createElement(SettingsSectionTabs, {
				activeTab: 'workspace',
				dirty: false,
				form: createBlankSettings(),
				profile: {
					dirty: false,
					form: {},
					pending: false,
					save: () => {},
					setForm: () => {},
				},
				runtimePending: null,
				setBackendDefault: () => {},
				setField: () => {},
				setRuntimePending: () => {},
				setTriumvirateField: () => {},
			})`,
		);
		const hintId = 'settings-applications-root-hint';

		expect(html).toContain(`aria-describedby="${hintId}"`);
		expect(html).toContain(`id="${hintId}"`);
		// The hint paragraph must be a sibling of the label; nested inside it, the whole sentence
		// is concatenated into the input's accessible name and re-announced on every focus.
		expect(html.indexOf(`id="${hintId}"`)).toBeGreaterThan(html.indexOf('</label>'));
	});

	test('describes a configured bot token without folding the status into the label', () => {
		const settings = createBlankSettings();
		settings.telegram = { ...settings.telegram, botToken: null, botTokenConfigured: true };
		const html = render(
			"import { TelegramChannelSection } from './src/pages/settings/TelegramChannelSection.tsx';",
			`createElement(TelegramChannelSection, {
				form: ${JSON.stringify(settings)},
				setField: () => {},
			})`,
		);
		const hintId = 'settings-telegram-bot-token-hint';

		expect(html).toContain(`aria-describedby="${hintId}"`);
		expect(html).toContain(`id="${hintId}"`);
		expect(html.indexOf(`id="${hintId}"`)).toBeGreaterThan(html.indexOf('</label>'));
	});

	test('omits the bot-token hint when there is nothing to describe', () => {
		const html = render(
			"import { TelegramChannelSection } from './src/pages/settings/TelegramChannelSection.tsx';\n" +
				"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';",
			`createElement(TelegramChannelSection, {
				form: createBlankSettings(),
				setField: () => {},
			})`,
		);

		expect(html).not.toContain('settings-telegram-bot-token-hint');
	});
});
