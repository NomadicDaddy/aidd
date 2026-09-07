import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function render(imports: string, expression: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		imports,
		`console.log(renderToStaticMarkup(${expression}));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

async function settingsSource(file: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, 'src/pages/settings', file)).text();
}

describe('Settings local remediation boundaries', () => {
	test('gives the Workspace groups one label register and one guidance order', async () => {
		const tabs = await settingsSource('SettingsSectionTabs.tsx');
		const list = await settingsSource('ListEditor.tsx');

		// Three sibling groups in the Workspace Roots card, one register. The two list
		// groups were titled by a subsection CardHeader while their own ListEditor label
		// was suppressed, so a 14px semibold heading sat beside the 12px uppercase field
		// label of the row above them. The editor renders that shared register itself.
		expect(tabs).not.toContain('level="subsection"');
		// The prop form, not the word: the comment above the card names it too.
		expect(tabs).not.toMatch(/^s*labelHidden$/mu);
		expect(tabs).toContain('label="Application Roots"');
		expect(tabs).toContain('label="Ignored Folders"');
		expect(list).toContain('cn(sectionCaptionClass,');
		expect(tabs).toContain('className="mb-0 @min-[61rem]:col-span-2"');
		expect(tabs).toContain('Every root listed here is scanned for projects.');
		expect(list.indexOf('{items.length === 0 ? (')).toBeLessThan(list.lastIndexOf('{hint ? ('));
	});

	test('marks the required Run Engine field and localizes budget guidance', () => {
		const html = render(
			"import { RunLimitsSection } from './src/pages/settings/RunLimitsSection.tsx';\n" +
				"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';",
			`createElement(RunLimitsSection, {
				form: { ...createBlankSettings(), maxConcurrentRuns: 1 },
				maxConcurrentRunsError: null,
				setField: () => {},
			})`,
		);

		expect(html).toContain('aria-required="true"');
		expect(html).toContain('Max concurrent runs<span aria-hidden="true"');
		const budgets = html.slice(
			html.indexOf('Budgets &amp; Timeouts'),
			html.indexOf('Backoff &amp; Safeguards'),
		);
		expect(budgets.match(/cumulative across the run/g)).toHaveLength(1);
		expect(budgets).toContain('warns but does not stop it');
	});

	test('presents Direct AI values as provider overrides with one credential owner', () => {
		const html = render(
			"import { DirectAiSection } from './src/pages/settings/DirectAiSection.tsx';",
			`createElement(DirectAiSection, {
				defaultProvider: 'zhipu',
				directAi: {
					apiKeyConfigured: false,
					baseUrl: null,
					enabled: true,
					model: null,
					provider: 'zhipu',
					reasoningEffort: null,
					surfaces: {
						directorChat: true,
						directorCycle: true,
						projectAdvisor: true,
						runSummaries: true,
					},
					timeoutSeconds: null,
				},
				directorChatAllowFileEdits: false,
				providerNames: ['zhipu'],
				providers: {
					zhipu: {
						apiKeyConfigured: true,
						baseUrl: 'https://api.z.ai/v1',
						model: 'glm-5.3',
						reasoningEffort: 'high',
					},
				},
				setField: () => {},
			})`,
		);

		expect(html).toContain('placeholder="glm-5.3"');
		expect(html).toContain('Inherited from Zhipu. Enter a value to override it.');
		expect(html).toContain('Provider Credential');
		expect(html).toContain('Providers &gt; Zhipu');
		expect(html).not.toContain('secretName="Direct AI API key"');
	});

	test('keeps Control Panel state rows mounted in clean and dirty states', () => {
		const imports =
			"import { SettingsRuntimeControls } from './src/pages/settings/SettingsRuntimeControls.tsx';";
		const clean = render(
			imports,
			`createElement(SettingsRuntimeControls, {
				dirty: false,
				runtimePending: null,
				setRuntimePending: () => {},
			})`,
		);
		const dirty = render(
			imports,
			`createElement(SettingsRuntimeControls, {
				dirty: true,
				runtimePending: null,
				setRuntimePending: () => {},
			})`,
		);

		expect(clean).toContain('Running · backend listener active · actions require confirmation');
		expect(dirty).toContain('Save or discard settings changes before restarting');
		expect(clean.match(/role="status"/g) ?? []).toHaveLength(0);
		expect(dirty.match(/role="status"/g)).toHaveLength(1);
		expect(`${clean}${dirty}`).toContain('border-border/80 bg-muted/90 shadow-inner');
	});

	test('states port restart consequences on the Port field', async () => {
		const network = await settingsSource('NetworkAccessSection.tsx');

		expect(network).toContain('Saving a new port restarts aidd-web and reloads this page.');
		expect(network).toContain('Saving a new hostname restarts aidd-web and reloads this page.');
		expect(network).not.toContain('Listener changes take effect after restarting aidd-web.');
	});
});
