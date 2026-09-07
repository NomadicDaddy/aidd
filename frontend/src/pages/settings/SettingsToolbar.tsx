import type { ComponentType } from 'react';

import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as Plug } from 'lucide-react/dist/esm/icons/plug';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { default as SlidersHorizontal } from 'lucide-react/dist/esm/icons/sliders-horizontal';
import { default as Undo2 } from 'lucide-react/dist/esm/icons/undo-2';

import type { SettingsTab } from './settingsNavigation.ts';

import { StatusDot } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { TabList } from '../../components/ui/tabs.tsx';
import { useContentRail } from '../../lib/contentRails.ts';
import { toneText } from '../../lib/tones.ts';

interface SettingsTabDefinition {
	icon: ComponentType<{ className?: string }>;
	id: SettingsTab;
	label: string;
}

/**
 * The locator the armed Save button lacks. `TabPanel` unmounts inactive panels, so an edit made on
 * Run Engine is invisible from Integrations; this marks the tab holding it.
 */
function UnsavedDot() {
	return (
		<span className="inline-flex items-center">
			<StatusDot tone="amber" />
			<span className="sr-only">unsaved changes</span>
		</span>
	);
}

const settingsTabs: readonly SettingsTabDefinition[] = [
	{ icon: FolderKanban, id: 'workspace', label: 'Workspace' },
	{ icon: Activity, id: 'run-engine', label: 'Run Engine' },
	{ icon: Bot, id: 'ai-director', label: 'AI & Director' },
	{ icon: Plug, id: 'integrations', label: 'Integrations' },
	{ icon: SlidersHorizontal, id: 'control-panel', label: 'Control Panel' },
];

export function SettingsToolbar({
	activeTab,
	dirty,
	dirtyTabs,
	onChange,
	onDiscard,
	onSave,
	profileDirty = false,
	saveBlockReason,
	savePending,
}: {
	activeTab: SettingsTab;
	dirty: boolean;
	dirtyTabs: ReadonlySet<SettingsTab>;
	onChange: (tab: SettingsTab) => void;
	onDiscard: () => void;
	onSave: () => void;
	profileDirty?: boolean;
	saveBlockReason: null | string;
	savePending: boolean;
}) {
	const rail = useContentRail();
	const tabs = settingsTabs.map((tab) =>
		dirtyTabs.has(tab.id)
			? { ...tab, badge: <UnsavedDot />, badgeLabel: 'unsaved changes' }
			: tab,
	);
	const activeTabDirty = dirtyTabs.has(activeTab);
	const statusMessage = saveBlockReason
		? saveBlockReason
		: profileDirty
			? 'Director Profile has unsaved changes. Use Save Profile; the phone Save control also commits it.'
			: savePending
				? 'Saving settings…'
				: activeTabDirty
					? 'Unsaved changes on this tab.'
					: dirty
						? 'Unsaved changes on another tab.'
						: 'No unsaved changes on this tab.';
	// Three states, three appearances. A blocked save is the only one that means the button will
	// not work, so it takes `red` plus an icon and announces itself assertively; unsaved work
	// takes `amber`; the resting line stays muted. Sharing one tone let "Save is blocked because
	// …" render identically to "No unsaved changes on this tab." — a failure indistinguishable
	// from the benign case, which is how a permanently blocked Save went unnoticed on five tabs.
	const statusTone = saveBlockReason
		? toneText.red
		: profileDirty || dirty
			? toneText.amber
			: 'text-muted-foreground';
	return (
		// A border marks the edge, rather than the only drop shadow on the surface. Nothing else on
		// Settings is lifted off the page, so `shadow-md` gave this one card a z-axis the rest of
		// the surface does not have — and it is the seam that needs stating, not the elevation.
		// The full toolbar stays in normal flow below `sm`; pinning its wrapped tabs and actions under
		// the mobile shell consumed 42% of a 390x844 viewport. At `sm` and above it keeps the shell's
		// published offset and the existing sticky desktop behavior.
		<Card
			className="space-y-2 border-b-2 border-border bg-card/95 p-2.5 backdrop-blur sm:sticky sm:top-[var(--app-topbar-height,0px)] sm:z-20"
			data-content-rail={rail}>
			{/* The Card fills the provided page rail; its controls share the padding box. */}
			<div className="flex flex-col gap-2 @min-[32rem]:flex-row @min-[32rem]:items-center @min-[32rem]:justify-between">
				{/* This strip used to be `default` at every width, on the reasoning that five tabs
				    measure roughly 640px against a 736px column at 1024 and so never wrap. That
				    reasoning is sound at 1024 and says nothing about 390, where the column is the
				    viewport: the strip wrapped to three ragged rows measuring 148px inside a 263px
				    toolbar, 31% of a 390x844 screen spent above the settings the page is named for.
				    `compact` is what the other tabbed surfaces already do at that width. The fact
				    the old reasoning was protecting — which tab holds an unsaved edit — survives as
				    `badgeLabel`, which the collapsed select appends to the option text; the amber
				    dot and its announcement are unchanged wherever the triggers are on screen. */}
				<div className="min-w-0">
					<TabList
						activeTab={activeTab}
						ariaLabel="Settings sections"
						density="compact"
						idPrefix="settings"
						onChange={onChange}
						tabs={tabs}
					/>
				</div>
				{/* `SettingsCommitBar` is `sm:hidden` and pins Discard and Save to the foot of
				    the viewport, so below `sm` both settings copies are on screen at once and this one
				    costs a 44px row plus its gap on every settings surface. The complement of that
				    breakpoint hides the row here; nothing is disclosed less, because the pinned
				    copy also commits the independently persisted Director Profile, carries both
				    pending states and the settings block reason, and stays on screen down forms
				    measuring 5850px where this one does not. The status line below stays: at the
				    page head it says whether the active or another tab holds the settings edit. */}
				<div className="flex shrink-0 items-center justify-end gap-2 max-sm:hidden">
					<Button
						aria-describedby="settings-toolbar-status"
						disabled={savePending || !dirty}
						onClick={onDiscard}
						size="compact"
						variant="secondary">
						<Undo2 aria-hidden="true" className="h-4 w-4" />
						Discard
					</Button>
					<Button
						aria-describedby="settings-toolbar-status"
						disabled={savePending || !dirty || Boolean(saveBlockReason)}
						onClick={onSave}
						size="compact"
						variant="primary">
						<Save aria-hidden="true" className="h-4 w-4" />
						{savePending ? 'Saving…' : 'Save Settings'}
					</Button>
				</div>
			</div>
			<p
				className={`flex items-start gap-1.5 text-xs max-sm:hidden ${saveBlockReason ? '' : '@min-[32rem]:justify-end'} ${statusTone}`}
				id="settings-toolbar-status"
				role={
					saveBlockReason
						? 'alert'
						: profileDirty || dirty || savePending
							? 'status'
							: undefined
				}>
				{saveBlockReason ? (
					<AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
				) : null}
				<span>{statusMessage}</span>
			</p>
		</Card>
	);
}
