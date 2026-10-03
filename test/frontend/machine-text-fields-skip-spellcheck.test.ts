import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Fields that hold a path, URL, model id, host, cron expression or CLI arguments turn the
 * browser's spellcheck and autocapitalisation off through machineTextProps. Prose fields keep
 * them. The counts are per file so a field added beside these, or one losing its props in a
 * refactor, changes a number this test checks.
 */
const read = (path: string): string =>
	readFileSync(resolve(process.cwd(), 'frontend', 'src', path), 'utf8');
const uses = (source: string): number => source.split('{...machineTextProps}').length - 1;

describe('machine-text fields are not spellchecked', () => {
	test('the props turn off spellcheck, autocorrect and autocapitalise', () => {
		const source = read('lib/machineText.ts');
		expect(source).toContain('spellCheck: false');
		expect(source).toContain("autoCorrect: 'off'");
		expect(source).toContain("autoCapitalize: 'off'");
	});

	test.each([
		['pages/settings/SettingsSectionTabs.tsx', 1],
		['pages/settings/ProviderConfigSection.tsx', 2],
		['pages/settings/BackendDefaultFields.tsx', 1],
		['pages/settings/DirectAiSection.tsx', 2],
		['pages/settings/GeneralDefaultsSection.tsx', 3],
		['pages/settings/ListEditor.tsx', 1],
		['pages/settings/NetworkAccessSection.tsx', 1],
		['pages/settings/SharedMetadataSection.tsx', 2],
		['pages/settings/SpernakitScaffoldingSection.tsx', 3],
		['pages/settings/TriumvirateSection.tsx', 3],
		['pages/scheduled/ScheduleFields.tsx', 1],
		['pages/scheduled/ScheduledTargetFields.tsx', 1],
		['pages/skills/SkillImportDialog.tsx', 1],
		['pages/projects/ProjectSpecField.tsx', 1],
	])('%s spreads machineTextProps on %i field(s)', (file, count) => {
		expect(uses(read(file))).toBe(count);
	});

	test('prose fields keep spellcheck', () => {
		expect(uses(read('components/shared/DirectiveLaunchModal.tsx'))).toBe(0);
		const spec = read('pages/projects/ProjectSpecField.tsx');
		const textarea = spec.slice(
			spec.indexOf('<textarea'),
			spec.indexOf('/>', spec.indexOf('<textarea')),
		);
		expect(textarea).not.toContain('machineTextProps');
	});
});
