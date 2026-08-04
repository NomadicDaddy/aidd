import type { ComponentType } from 'react';

import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as Plug } from 'lucide-react/dist/esm/icons/plug';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { default as SlidersHorizontal } from 'lucide-react/dist/esm/icons/sliders-horizontal';
import { default as Undo2 } from 'lucide-react/dist/esm/icons/undo-2';

import type { SettingsTab } from './settingsNavigation.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { TabList } from '../../components/ui/tabs.tsx';
import { selectClass } from '../../lib/formStyles.ts';

interface SettingsTabDefinition {
	icon: ComponentType<{ className?: string }>;
	id: SettingsTab;
	label: string;
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
	onChange,
	onDiscard,
	onSave,
	saveBlockReason,
	savePending,
}: {
	activeTab: SettingsTab;
	dirty: boolean;
	onChange: (tab: SettingsTab) => void;
	onDiscard: () => void;
	onSave: () => void;
	saveBlockReason: null | string;
	savePending: boolean;
}) {
	return (
		<Card className="sticky top-0 z-20 space-y-2 border-teal-950/20 bg-card/95 p-2.5 shadow-md backdrop-blur dark:border-teal-950/70">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="hidden min-w-0 xl:block">
					<TabList
						activeTab={activeTab}
						ariaLabel="Settings sections"
						idPrefix="settings"
						onChange={onChange}
						tabs={settingsTabs}
					/>
				</div>
				<label className="min-w-0 flex-1 xl:hidden">
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
								{tab.label}
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
				<p
					className="text-xs text-amber-600 sm:text-right dark:text-amber-400"
					role="status">
					{saveBlockReason}
				</p>
			) : null}
		</Card>
	);
}
