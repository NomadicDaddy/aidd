import type { ComponentType } from 'react';

import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
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
import { selectClass } from '../../lib/formStyles.ts';
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
	saveBlockReason,
	savePending,
}: {
	activeTab: SettingsTab;
	dirty: boolean;
	dirtyTabs: ReadonlySet<SettingsTab>;
	onChange: (tab: SettingsTab) => void;
	onDiscard: () => void;
	onSave: () => void;
	saveBlockReason: null | string;
	savePending: boolean;
}) {
	const tabs = settingsTabs.map((tab) =>
		dirtyTabs.has(tab.id) ? { ...tab, badge: <UnsavedDot /> } : tab,
	);
	return (
		// A border marks the edge, rather than the only drop shadow on the surface. Nothing else on
		// Settings is lifted off the page, so `shadow-md` gave this one card a z-axis the rest of
		// the surface does not have — and it is the seam that needs stating, not the elevation.
		// The offset is the shell nav bar's own published height. Below `sm` that bar is a sticky
		// element in flow at the same `z-20`, so an unoffset toolbar and it occupy the same strip
		// and the later one in the DOM — this — paints over the navigation.
		<Card className="sticky top-[var(--app-topbar-height,0px)] z-20 space-y-2 border-b-2 border-border bg-card/95 p-2.5 backdrop-blur">
			<div className="flex flex-col gap-2 @min-[32rem]:flex-row @min-[32rem]:items-center @min-[32rem]:justify-between">
				<div className="hidden min-w-0 @min-[61rem]:block">
					<TabList
						activeTab={activeTab}
						ariaLabel="Settings sections"
						idPrefix="settings"
						onChange={onChange}
						tabs={tabs}
					/>
				</div>
				<label className="min-w-0 flex-1 @min-[61rem]:hidden">
					<span className="sr-only">Settings section</span>
					<select
						aria-label="Settings section"
						autoComplete="off"
						className={`${selectClass} w-full`}
						name="settings-section"
						onChange={(event) => onChange(event.target.value as SettingsTab)}
						value={activeTab}>
						{settingsTabs.map((tab) => (
							<option key={tab.id} value={tab.id}>
								{dirtyTabs.has(tab.id) ? `${tab.label} • unsaved` : tab.label}
							</option>
						))}
					</select>
				</label>
				<div className="flex shrink-0 items-center justify-end gap-2">
					<Button
						disabled={savePending || !dirty}
						onClick={onDiscard}
						size="compact"
						variant="secondary">
						<Undo2 aria-hidden="true" className="h-4 w-4" />
						Discard
					</Button>
					<Button
						disabled={savePending || !dirty}
						onClick={onSave}
						size="compact"
						variant="primary">
						<Save aria-hidden="true" className="h-4 w-4" />
						{savePending ? 'Saving…' : 'Save Settings'}
					</Button>
				</div>
			</div>
			{saveBlockReason && !savePending ? (
				<p className={`text-xs @min-[32rem]:text-right ${toneText.amber}`} role="status">
					{saveBlockReason}
				</p>
			) : null}
		</Card>
	);
}
