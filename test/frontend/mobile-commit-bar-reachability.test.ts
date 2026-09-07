import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
	applySettingsRecordAction,
	createSettingsRecordActions,
} from '../../frontend/src/pages/settings/settingsRecordActions.ts';

const SRC = resolve(import.meta.dir, '../../frontend/src');
const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function source(relative: string): string {
	return readFileSync(join(SRC, relative), 'utf8');
}

/** Renders the commit strip with changes staged and reports its markup. */
function renderCommitBar(props: Record<string, unknown>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { CommitBar } from './src/components/shared/CommitBar.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		`const bar = createElement(CommitBar, {`,
		`\tonDiscard: () => undefined,`,
		`\tonSave: () => undefined,`,
		`\t...${JSON.stringify(props)},`,
		'});',
		"console.log(renderToStaticMarkup(createElement(PageRail, { rail: 'full' }, bar)));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('a long editor keeps its commit control on screen', () => {
	test('the strip pins to the foot of the viewport and clears the home indicator', () => {
		const bar = source('components/shared/CommitBar.tsx');

		// The mechanism, not the symptom. `sticky bottom-0` is what keeps the button reachable
		// while the form it commits runs several screens past it, and the safe-area padding is
		// what stops it sitting under the home indicator — `main`'s own bottom padding applies to
		// content in flow, never to a pinned child.
		expect(bar).toContain('sticky bottom-2 z-20');
		expect(bar).toContain('rounded-xl border border-control-border bg-card');
		expect(bar).toContain('commitBarClearanceClass');
		expect(bar).toContain('pb-[max(0.5rem,env(safe-area-inset-bottom))]');
	});

	test('the staged count and both controls travel with the button', () => {
		const staged = renderCommitBar({
			dirty: true,
			dirtyLabel: '3 unsaved changes',
			saveLabel: 'Save Overrides',
		});
		const clean = renderCommitBar({
			dirty: false,
			dirtyLabel: '3 unsaved changes',
			saveLabel: 'Save Overrides',
		});

		// The count was off screen for exactly as long as the button was, so it moves with it.
		expect(staged).toContain('3 unsaved changes');
		expect(staged).toContain('Save Overrides');
		expect(staged).toContain('Discard');
		expect(staged).not.toContain('disabled=""');
		// A clean form needs no pinned strip; the toolbar owns the resting status.
		expect(clean).not.toContain('No unsaved changes');
		expect(clean).not.toContain('data-commit-bar');
	});

	test('a refused save says why, next to the button that refuses', () => {
		const blocked = renderCommitBar({
			blockReason: 'Fix the highlighted fields first.',
			dirty: true,
			dirtyLabel: '1 unsaved change',
			saveLabel: 'Save',
		});
		const quiet = renderCommitBar({
			blockReason: 'Fix the highlighted fields first.',
			dirty: false,
			dirtyLabel: '1 unsaved change',
			saveLabel: 'Save',
		});

		expect(blocked).toContain('Fix the highlighted fields first.');
		expect(blocked).toContain('aria-live="polite"');
		expect(blocked).toContain('id="commit-bar-block-reason"');
		// Announcing a block before anything is staged is a scold, not a hint.
		expect(quiet).not.toContain('Fix the highlighted fields first.');
	});

	test('the two longest forms in the app reach it', () => {
		const settings = source('pages/settings/SettingsCommitBar.tsx');
		const overrides = source('pages/audits/tabs/OverridesTab.tsx');
		const notes = source('pages/projects/detail/NotesTab.tsx');

		// Settings hides the strip from `sm` up because SettingsToolbar re-pins its own Save
		// there; audits-overrides pins at every width because nothing else on that surface does.
		expect(settings).toContain('<CommitBar');
		expect(settings).toContain('className="sm:hidden"');
		expect(overrides).toContain('<CommitBar');
		expect(overrides).not.toContain('sm:hidden');
		// Project Notes is another long phone editor. Its header Save remains useful above `sm`,
		// while the phone copy carries both the live character count and length-limit reason.
		expect(notes).toContain('<CommitBar');
		expect(notes).toContain('className="sm:hidden"');
		expect(notes).toContain('dirtyLabel={lengthMessage}');
		expect(notes).toContain('blockReason={overLimit ? lengthMessage : null}');
	});

	test('the Settings strip acts on every dirty persistence boundary it names', () => {
		const calls: string[] = [];
		applySettingsRecordAction({
			profileAction: () => calls.push('profile'),
			profileDirty: true,
			settingsAction: () => calls.push('settings'),
			settingsDirty: true,
		});
		expect(calls).toEqual(['settings', 'profile']);

		calls.length = 0;
		applySettingsRecordAction({
			profileAction: () => calls.push('profile'),
			profileDirty: true,
			settingsAction: () => calls.push('settings'),
			settingsDirty: false,
		});
		expect(calls).toEqual(['profile']);

		calls.length = 0;
		applySettingsRecordAction({
			profileAction: () => calls.push('profile'),
			profileDirty: false,
			settingsAction: () => calls.push('settings'),
			settingsDirty: true,
		});
		expect(calls).toEqual(['settings']);

		calls.length = 0;
		applySettingsRecordAction({
			profileAction: () => calls.push('profile'),
			profileDirty: false,
			settingsAction: () => calls.push('settings'),
			settingsDirty: false,
		});
		expect(calls).toEqual([]);

		const blocked: string[] = [];
		createSettingsRecordActions({
			onSaveBlocked: (reason) => blocked.push(reason),
			profileDiscard: () => calls.push('profile-discard'),
			profileDirty: true,
			profileSave: () => calls.push('profile-save'),
			saveBlockReason: 'Fix settings first.',
			settingsDirty: true,
			settingsDiscard: () => calls.push('settings-discard'),
			settingsSave: () => calls.push('settings-save'),
		}).save();
		expect(blocked).toEqual(['Fix settings first.']);
		expect(calls).toEqual([]);

		createSettingsRecordActions({
			onSaveBlocked: (reason) => blocked.push(reason),
			profileDiscard: () => calls.push('profile-discard'),
			profileDirty: true,
			profileSave: () => calls.push('profile-save'),
			saveBlockReason: 'Irrelevant settings error.',
			settingsDirty: false,
			settingsDiscard: () => calls.push('settings-discard'),
			settingsSave: () => calls.push('settings-save'),
		}).save();
		expect(calls).toEqual(['profile-save']);

		const page = source('pages/settings/SettingsPage.tsx');
		expect(page).toContain('profileSave: profile.save');
		expect(page).toContain('profileDiscard: profile.discard');
		expect(page).toContain('dirtyTabs={savedDirtyTabs}');
		expect(page).toContain('savePending={update.isPending || profile.pending}');
	});
});
