import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

/**
 * Every save island on Settings has a dirty vocabulary — a primary Save that arms, and an amber dot
 * on the tab holding the edit. The Director Profile card had neither: Save Profile looked identical
 * dirty or clean, the AI & Director trigger stayed bare, and the panel it lives in unmounts on a tab
 * switch, so the edit the missing dot failed to mention was silently discarded.
 */
describe('the Director Profile card has the surface dirty vocabulary', () => {
	test('the form is compared against the saved record', async () => {
		const hook = await read('pages/settings/useDirectorProfileForm.ts');

		// Both sides through `profileInput`, which is what Save would actually send: a Role retyped
		// to the same value, or trailing whitespace in Behavior, is not a change.
		expect(hook).toContain('JSON.stringify(profileInput(edited))');
		expect(hook).toContain('JSON.stringify(profileInput(saved))');
		expect(hook).toContain('director.profile.data');
	});

	test('the state outlives the panel that renders it', async () => {
		const page = await read('pages/settings/SettingsPage.tsx');
		const tabs = await read('pages/settings/SettingsSectionTabs.tsx');

		// A `TabPanel` unmounts when it is not the active tab, so a dot pointing at state held
		// inside one would be pointing at state that no longer exists. The page owns it and passes
		// it down.
		expect(page).toContain('const profile = useDirectorProfileForm();');
		expect(page).toContain('profile={profile}');
		expect(tabs).toContain('profile: DirectorProfileForm;');
		expect(tabs).toContain('dirty={profile.dirty}');
	});

	test('Save Profile is the same shape as the page save', async () => {
		const section = await read('pages/director/DirectorProfileSection.tsx');
		const toolbar = await read('pages/settings/SettingsToolbar.tsx');

		expect(section).toContain('disabled={pending || !dirty}');
		expect(section).toContain('variant="primary"');
		// The island it is being matched to. If the toolbar's own Save ever stops being a primary
		// that disables when clean, this card should follow it rather than drift again.
		expect(toolbar).toContain('disabled={savePending || !dirty}');
		expect(toolbar).toContain('variant="primary"');
	});

	test('the dirty flag reaches the tab trigger', async () => {
		const page = await read('pages/settings/SettingsPage.tsx');

		expect(page).toContain("new Set<SettingsTab>([...savedDirtyTabs, 'ai-director'])");
		// And the same flag arms the leaving-the-page confirmation, which is the harm the missing
		// dot actually caused: navigating away believing the edit was held.
		expect(page).toContain('(dirty || profile.dirty)');
	});

	test('the dot is announced, not only drawn', async () => {
		const toolbar = await read('pages/settings/SettingsToolbar.tsx');

		// Whatever lands in `dirtyTabs` gains "unsaved changes" in the trigger's accessible name.
		// It used to also spell " • unsaved" into a narrow-viewport select's option text; that
		// select is gone, so the dot is the single marker and it has to carry the announcement.
		expect(toolbar).toContain('<span className="sr-only">unsaved changes</span>');
		expect(toolbar).toContain(
			'dirtyTabs.has(tab.id) ? { ...tab, badge: <UnsavedDot /> } : tab',
		);
	});

	test('nothing copies the profile into state behind an effect', async () => {
		const hook = await read('pages/settings/useDirectorProfileForm.ts');

		// `null` means untouched, so the form follows the server record until someone types. The
		// version this replaced seeded `useState` from a `useEffect` and needed the react-hooks
		// escape hatch to do it; it also could not tell a freshly loaded profile from an edit.
		expect(hook).not.toContain('useEffect');
		expect(hook).not.toContain('eslint-disable');
		expect(hook).toContain('edited ?? saved');
	});
});
