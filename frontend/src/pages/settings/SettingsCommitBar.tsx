import type { SettingsTab } from './settingsNavigation.ts';

import { CommitBar } from '../../components/shared/CommitBar.tsx';

/**
 * What is staged on Settings, counted in the unit Settings stages things in.
 *
 * `TabPanel` unmounts inactive panels, so unsaved work on Run Engine is invisible from
 * Integrations; the amber dot on the tab strip says which tab holds it, and the tab strip is one of
 * the things that scrolls away. Counting tabs rather than fields is what makes the number
 * actionable — it tells you how many places you still have to look.
 */
function stagedLabel(dirtyTabs: ReadonlySet<SettingsTab>, profileDirty: boolean): string {
	const tabs = dirtyTabs.size;
	const profile = profileDirty ? 'Director Profile' : null;
	if (tabs === 0) return profile === null ? 'Unsaved changes' : `${profile} has unsaved changes`;
	const counted = `${tabs} ${tabs === 1 ? 'tab' : 'tabs'} unsaved`;
	return profile === null ? counted : `${counted}, plus ${profile}`;
}

/**
 * The Settings commit control, at the foot of the viewport, below `sm` only.
 *
 * `SettingsToolbar` is `sm:sticky`, so on a phone the one control that commits the form unpins over
 * forms measuring 1648px (Integrations), 2679px (Control Panel) and 5850px (the longest tab). From `sm`
 * up the toolbar is pinned again and a second copy of Save would be noise, so this hides there
 * rather than going static.
 */
export function SettingsCommitBar({
	dirty,
	dirtyTabs,
	onDiscard,
	onSave,
	profileDirty,
	saveBlockReason,
	savePending,
}: {
	dirty: boolean;
	dirtyTabs: ReadonlySet<SettingsTab>;
	onDiscard: () => void;
	onSave: () => void;
	profileDirty: boolean;
	saveBlockReason: null | string;
	savePending: boolean;
}) {
	return (
		<CommitBar
			blockReason={saveBlockReason}
			className="sm:hidden"
			dirty={dirty || profileDirty}
			dirtyLabel={stagedLabel(dirtyTabs, profileDirty)}
			onDiscard={onDiscard}
			onSave={onSave}
			pending={savePending}
			saveLabel="Save"
			statusId="settings-commit-status"
		/>
	);
}
