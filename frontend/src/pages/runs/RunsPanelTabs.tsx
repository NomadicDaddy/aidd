import { Badge, StatusDot } from '../../components/ui/badge.tsx';
import { TabList } from '../../components/ui/tabs.tsx';

export type RunsPanel = 'active' | 'console' | 'history';

export const RUNS_PANEL_ID = 'runs-panels';

interface RunsPanelTabsProps {
	activeCount: number;
	activePanel: RunsPanel;
	hasSelection: boolean;
	historyCount: number;
	onChange: (panel: RunsPanel) => void;
}

export function RunsPanelTabs({
	activeCount,
	activePanel,
	hasSelection,
	historyCount,
	onChange,
}: RunsPanelTabsProps) {
	return (
		<div className="sm:hidden">
			<TabList
				activeTab={activePanel}
				ariaLabel="Run panels"
				idPrefix={RUNS_PANEL_ID}
				onChange={onChange}
				tabs={[
					{
						badge: (
							<Badge
								aria-label={`${activeCount} active executions`}
								className="px-1.5 py-0.5">
								{activeCount}
							</Badge>
						),
						id: 'active',
						label: 'Active',
					},
					{
						badge: hasSelection ? (
							<span
								aria-label="Selection active"
								className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-background/80">
								<StatusDot tone="emerald" />
							</span>
						) : undefined,
						id: 'console',
						label: 'Console',
					},
					{
						badge: (
							<Badge
								aria-label={`${historyCount} history executions shown`}
								className="px-1.5 py-0.5">
								{historyCount}
							</Badge>
						),
						id: 'history',
						label: 'History',
					},
				]}
			/>
		</div>
	);
}
