import { describe, expect, test } from 'bun:test';

import { scheduledSaveReadiness } from '../../frontend/src/pages/scheduled/scheduledSaveReadiness.ts';

async function source(path: string): Promise<string> {
	return await Bun.file(path).text();
}

describe('computed validation state reaches the control and commit action', () => {
	test('scheduled save uses the rendered schedule error and explains every blocker', () => {
		expect(
			scheduledSaveReadiness({
				applyChanges: false,
				confirmed: false,
				issue: { field: 'cron', message: 'Fix the cron expression.' },
				name: 'Nightly audit',
				pending: false,
				projectSelectionMissing: false,
				projectScope: 'all',
				system: false,
				target: { type: 'skill' },
				targetId: 'hygiene',
			}),
		).toEqual({ blocked: true, reason: 'Fix the cron expression.' });
		expect(
			scheduledSaveReadiness({
				applyChanges: true,
				confirmed: false,
				issue: null,
				name: 'Nightly audit',
				pending: false,
				projectSelectionMissing: false,
				projectScope: 'all',
				system: false,
				target: { type: 'skill' },
				targetId: 'hygiene',
			}),
		).toEqual({ blocked: true, reason: 'Confirm the unattended-change consent above.' });
	});

	test('the shared field pins controls to their labels and owns invalid-state wiring', async () => {
		const field = await source('frontend/src/components/ui/field.tsx');

		expect(field).toContain("'grid content-start gap-1'");
		expect(field).not.toContain("'grid max-w-");
		expect(field).toContain('htmlFor={resolvedControlId}');
		expect(field).toContain('role="group"');
		expect(field).not.toContain('<label className="contents"');
		expect(field).toContain('className={fieldHintClass}');
		expect(field).toContain("'aria-invalid': invalid || undefined");
		expect(field).toContain('<p className={fieldErrorClass} id={messageId} role="alert">');
	});

	test('settings and directive fields consume FieldRow errors beside their controls', async () => {
		const [directive, limits, page, tabs] = await Promise.all([
			source('frontend/src/components/shared/DirectiveLaunchModal.tsx'),
			source('frontend/src/pages/settings/RunLimitsSection.tsx'),
			source('frontend/src/pages/settings/SettingsPage.tsx'),
			source('frontend/src/pages/settings/SettingsSectionTabs.tsx'),
		]);

		expect(directive).toContain('error={projectError}');
		expect(directive).toContain('error={promptError}');
		expect(directive).toContain('label="Directive"');
		expect(limits).toContain('error={maxConcurrentRunsError}');
		expect(page).toContain('maxConcurrentRunsError={maxConcurrentRunsError}');
		expect(tabs.indexOf('<DirectorProfileSection')).toBeLessThan(
			tabs.indexOf('<GeneralDefaultsSection'),
		);
	});

	test('project switching requires an explicit discard when overrides are dirty', async () => {
		const overrides = await source('frontend/src/pages/audits/tabs/OverridesTab.tsx');

		expect(overrides).toContain('if (dirty) {');
		expect(overrides).toContain('setPendingProjectId(nextProjectId)');
		expect(overrides).toContain('title="Discard unsaved overrides?"');
		expect(overrides).toContain('onConfirm={discardAndChangeProject}');
		expect(overrides).toContain('error={rulesError}');
		expect(await source('frontend/src/pages/audits/tabs/OverridesRulesCard.tsx')).toContain(
			'<FieldRow error={error}',
		);
	});
});
