import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const settingsRoot = resolve(import.meta.dir, '../../frontend/src/pages/settings');
const directorRoot = resolve(import.meta.dir, '../../frontend/src/pages/director');

async function source(root: string, file: string): Promise<string> {
	return Bun.file(resolve(root, file)).text();
}

/** Collapses hard-wrapped markdown prose to single-spaced text for phrase matching. */
function unwrapped(text: string): string {
	return text.replace(/\s+/g, ' ');
}

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

describe('settings tab local design contracts', () => {
	test('keeps Workspace discovery and list actions inside their owning cards', async () => {
		const tabs = await source(settingsRoot, 'SettingsSectionTabs.tsx');
		const listEditor = await source(settingsRoot, 'ListEditor.tsx');
		const sharedMetadata = await source(settingsRoot, 'SharedMetadataSection.tsx');

		expect(tabs).toContain('label="Fallback discovery root"');
		expect(tabs).toContain('@min-[61rem]:grid-cols-2');
		expect(tabs).toContain('inputClassName={`${compactFieldMeasureClass} font-mono`}');
		expect(tabs).toContain('className={`${compactFieldMeasureClass}');
		expect(tabs).toContain('Every root listed here is scanned for projects.');
		expect(tabs).toContain(
			'Matched against folder names or glob patterns during project discovery.',
		);
		expect(tabs).not.toContain('title="Applications Root"');
		expect(tabs.match(/minimumItems=\{1\}/gu)).toHaveLength(1);
		expect(listEditor).toContain('validateItem?: (item: string) => null | string');
		expect(listEditor).toContain('grid-flow-col');
		expect(sharedMetadata).toContain('size="compact"');
		expect(sharedMetadata).toContain('aria-label="Add shared file entry"');
		expect(sharedMetadata).not.toContain('FileSymlink');
		expect(sharedMetadata).not.toContain('FolderSymlink');
	});

	test('aligns Run Engine fields and exposes inherited timeout defaults', async () => {
		const limits = await source(settingsRoot, 'RunLimitsSection.tsx');
		const defaults = await source(settingsRoot, 'BackendDefaultFields.tsx');
		const table = await source(settingsRoot, 'BackendDefaultsTable.tsx');
		const probe = await source(settingsRoot, 'backendProbeLine.ts');

		expect(limits).toContain('grid-cols-[repeat(2,minmax(0,20rem))]');
		expect(limits).toContain('className="max-w-xs self-end rounded-none border-0 px-0"');
		expect(limits).toContain('border-border p-4');
		expect(limits).not.toContain('ConfigKey');
		expect(defaults).toContain('Shared default (${sharedIdleTimeoutSeconds ?? 900})');
		expect(defaults).toContain('Shared default (${sharedIdleNudgeTimeoutSeconds ?? 600})');
		expect(table).toContain('<colgroup>');
		expect(table).toContain('className="w-64"');
		expect(probe).toContain('detail.toLowerCase() === status.status');
	});

	test('gives AI and Director cards explicit hierarchy and bounded controls', async () => {
		const profile = await source(directorRoot, 'DirectorProfileSection.tsx');
		const directAi = await source(settingsRoot, 'DirectAiSection.tsx');
		const providers = await source(settingsRoot, 'ProviderConfigSection.tsx');
		const general = await source(settingsRoot, 'GeneralDefaultsSection.tsx');

		expect(profile).toContain('@min-[61rem]:grid-cols-3');
		expect(profile).toContain('Fleet Director profile saved.');
		expect(profile).toContain('size="compact"');
		expect(directAi).toContain('title="Direct AI"');
		expect(directAi).toContain('title="Director Chat Permissions"');
		expect(providers).toContain('minmax(0,44rem)_max-content');
		expect(general).toContain('Execution badge reference');
		expect(general).not.toContain('badge={<Badge');
	});

	test('shares validation and dirty-state feedback with the affected controls', async () => {
		const settingsPage = await source(settingsRoot, 'SettingsPage.tsx');
		const runtime = await source(settingsRoot, 'SettingsRuntimeControls.tsx');
		const toolbar = await source(settingsRoot, 'SettingsToolbar.tsx');

		expect(settingsPage).toContain('Number.isSafeInteger');
		expect(settingsPage).toContain('profileDirty={profile.dirty}');
		expect(toolbar).toContain('No unsaved changes on this tab.');
		expect(toolbar).toContain('Boolean(saveBlockReason)');
		expect(runtime).toContain('aria-disabled={dirty || undefined}');
		expect(runtime).toContain('Save or discard settings changes before restarting');
	});

	test('keeps Control Panel cards bounded and metrics comparable', async () => {
		const network = await source(settingsRoot, 'NetworkAccessSection.tsx');
		const observability = await source(settingsRoot, 'ObservabilitySection.tsx');
		const metrics = `${await source(settingsRoot, 'SystemMetricsSection.tsx')}\n${await source(
			settingsRoot,
			'SystemMetricsVitals.tsx',
		)}`;
		const statuses = await source(settingsRoot, 'SettingsStatusPanels.tsx');

		expect(network).toContain('<FormGrid>');
		expect(observability).toContain('compactFieldMeasureClass');
		expect(metrics).toContain('<Card className="flex flex-col gap-4" variant="sunken">');
		expect(metrics).not.toContain('contentRailClass');
		expect(metrics).toContain('Latest rating');
		expect(metrics).toContain('vital.p75 <= vital.threshold');
		expect(metrics).toContain('@min-[45rem]:grid-cols-3');
		expect(statuses).toContain('title="Source Control"');
		expect(statuses).toContain('action={refreshAction}');
		expect(statuses).toContain('grid-cols-[minmax(0,1fr)_max-content_max-content]');
		expect(statuses).not.toContain('max-w-3xl');
		expect(metrics).toContain('millisecondVitalNames');
	});

	test('calls the web credential an access token across operator surfaces', async () => {
		const repoRoot = resolve(import.meta.dir, '../..');
		const network = await source(settingsRoot, 'NetworkAccessSection.tsx');
		const dialog = await source(
			resolve(repoRoot, 'frontend/src/components/shared'),
			'AuthTokenDialog.tsx',
		);
		const layout = await source(
			resolve(repoRoot, 'frontend/src/components/layout'),
			'AppLayout.tsx',
		);
		// Prose docs are hard-wrapped by prettier, so a phrase can straddle a line break at any
		// reflow. Match the wording, not the wrapping.
		const architecture = unwrapped(
			await source(resolve(repoRoot, 'docs/architecture'), 'overview.md'),
		);
		const settingsDocs = await source(
			resolve(repoRoot, 'frontend/content/docs'),
			'settings.md',
		);
		const configuration = await source(resolve(repoRoot, 'docs/reference'), 'configuration.md');
		const deployment = await source(resolve(repoRoot, 'docs/reference'), 'deployment.md');
		const quickstart = await source(resolve(repoRoot, 'docs'), 'quickstart.md');

		expect(network).toContain('An access token is configured.');
		expect(network).toContain('An access token will be generated');
		expect(network).toContain('configured access token using the Authorization: Bearer scheme');
		expect(network).not.toContain('bearer token');
		expect(dialog).toContain('Access token');
		expect(layout).toContain('ariaLabel="Set access token"');
		expect(architecture).toContain('optional access token');
		expect(settingsDocs).toContain('generates an access token if needed');
		expect(configuration).toContain('Access token guarding the API.');
		expect(deployment).toContain('Access token for the web API;');
		expect(quickstart).toContain('LAN-binding access token');
	});
});

describe('settings validation render boundaries', () => {
	test('renders the canonical access-token status for both configuration states', () => {
		const imports =
			"import { NetworkAccessSection } from './src/pages/settings/NetworkAccessSection.tsx';\n" +
			"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';";
		const unconfigured = render(
			imports,
			`createElement(NetworkAccessSection, {
				form: createBlankSettings(),
				setField: () => {},
			})`,
		);
		const configured = render(
			imports,
			`createElement(NetworkAccessSection, {
				form: { ...createBlankSettings(), authTokenConfigured: true },
				setField: () => {},
			})`,
		);

		expect(unconfigured).toContain('An access token will be generated');
		expect(configured).toContain('An access token is configured.');
		expect(`${unconfigured}${configured}`).not.toContain('bearer token');
	});

	test('renders an optional empty list as an empty state with its add control', () => {
		const html = render(
			"import { ListEditor } from './src/pages/settings/ListEditor.tsx';",
			`createElement(ListEditor, {
				items: [],
				label: 'Allowed Chat IDs',
				onChange: () => {},
				placeholder: 'Numeric chat ID',
			})`,
		);

		expect(html).toContain('No entries configured.');
		expect(html).toContain('aria-label="Add Allowed Chat IDs entry"');
		expect(html).not.toContain('<input');
		expect(html).not.toContain('Remove Allowed Chat IDs');
	});

	test('associates list guidance with the whole editor group', () => {
		const html = render(
			"import { ListEditor } from './src/pages/settings/ListEditor.tsx';",
			`createElement(ListEditor, {
				hint: 'Matched during project discovery.',
				items: ['node_modules'],
				label: 'Ignored Folders',
				onChange: () => {},
				placeholder: 'Folder name or pattern',
			})`,
		);

		expect(html).toContain('role="group"');
		expect(html).toContain('aria-labelledby=');
		expect(html).toContain('aria-describedby=');
		expect(html).toContain('Matched during project discovery.');
	});

	test('allows an optional final row to be removed but preserves an explicit minimum', () => {
		const optional = render(
			"import { ListEditor } from './src/pages/settings/ListEditor.tsx';",
			`createElement(ListEditor, {
				items: ['123'],
				label: 'Allowed Chat IDs',
				onChange: () => {},
				placeholder: 'Numeric chat ID',
			})`,
		);
		const required = render(
			"import { ListEditor } from './src/pages/settings/ListEditor.tsx';",
			`createElement(ListEditor, {
				items: ['D:/applications'],
				label: 'Application Roots',
				minimumItems: 1,
				onChange: () => {},
				placeholder: 'Enter root path',
			})`,
		);

		expect(optional).toContain('aria-label="Remove Allowed Chat IDs entry 123"');
		expect(optional).not.toContain('disabled=""');
		expect(required).toContain('aria-label="Remove Application Roots entry D:/applications"');
		expect(required).toContain('disabled=""');
	});

	test('renders an invalid Telegram chat ID as linked inline feedback', () => {
		const html = render(
			"import { TelegramChannelSection } from './src/pages/settings/TelegramChannelSection.tsx';\n" +
				"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';",
			`createElement(TelegramChannelSection, {
				form: { ...createBlankSettings(), telegram: {
					...createBlankSettings().telegram,
					allowedChatIds: [Number.NaN],
				} },
				setField: () => {},
			})`,
		);

		expect(html).toContain('aria-invalid="true"');
		expect(html).toMatch(/aria-describedby="[^"]+-entry-0-error"/u);
		expect(html).not.toContain('aria-describedby="Allowed Chat IDs');
		expect(html).toContain('role="alert"');
		expect(html).toContain('Enter a whole-number chat ID or remove this entry.');
		expect(html).toContain('>Add<');
	});

	test('renders runtime actions as explained but focusable while settings are dirty', () => {
		const html = render(
			"import { SettingsRuntimeControls } from './src/pages/settings/SettingsRuntimeControls.tsx';",
			`createElement(SettingsRuntimeControls, {
				dirty: true,
				runtimePending: null,
				setRuntimePending: () => {},
			})`,
		);

		expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
		expect(html).toContain('role="status"');
		expect(html).not.toContain('disabled=""');
	});
});
