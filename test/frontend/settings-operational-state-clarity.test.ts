import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const settingsRoot = join(process.cwd(), 'frontend', 'src', 'pages', 'settings');

function read(file: string): Promise<string> {
	return Bun.file(join(settingsRoot, file)).text();
}

describe('settings operational state clarity', () => {
	test('separates project scaffolding from model routing', async () => {
		const [general, scaffolding, tabs] = await Promise.all([
			read('GeneralDefaultsSection.tsx'),
			read('SpernakitScaffoldingSection.tsx'),
			read('SettingsSectionTabs.tsx'),
		]);

		expect(general).toContain('title="Model Routing"');
		expect(general).not.toContain('spernakitInitScript');
		expect(scaffolding).toContain('title="Spernakit Scaffolding"');
		expect(scaffolding).toContain("setField('spernakitInitScript'");
		expect(tabs.indexOf('<SpernakitScaffoldingSection')).toBeLessThan(
			tabs.indexOf('<SharedMetadataSection'),
		);
	});

	test('keeps provider state intrinsic at desktop widths', async () => {
		const providers = await read('ProviderConfigSection.tsx');

		expect(providers).toContain(
			'className="inline-flex justify-self-start @min-[32rem]:justify-self-end"',
		);
		expect(providers).toContain('<Badge tone="neutral">Default</Badge>');
		expect(providers).toContain('<CredentialBadge configured={provider.apiKeyConfigured} />');
	});

	test('bounds run controls while leaving the backend matrix full width', async () => {
		const [page, tabs] = await Promise.all([
			read('SettingsPage.tsx'),
			read('SettingsSectionTabs.tsx'),
		]);
		const limits = tabs.indexOf('<RunLimitsSection');
		const matrix = tabs.indexOf('<BackendDefaultsTable', limits);

		expect(page).toContain('const PAGE_RAIL = pageRailByContentType.workflow;');
		expect(page).toContain('rail={PAGE_RAIL}');
		expect(tabs).not.toContain('contentRailClass');
		expect(limits).toBeGreaterThan(-1);
		expect(matrix).toBeGreaterThan(limits);
	});
});
