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
							<Badge casing="preserve" className="px-1.5 py-0.5">
								<span aria-hidden="true">{activeCount}</span>
								<span className="sr-only">{activeCount} active executions</span>
							</Badge>
						),
						id: 'active',
						label: 'Active',
					},
					{
						badge: hasSelection ? (
							<span
								aria-label="Selection active"
								className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-background/80"
								role="img">
								<StatusDot tone="emerald" />
							</span>
						) : undefined,
						id: 'console',
						label: 'Console',
					},
					{
						badge: (
							<Badge casing="preserve" className="px-1.5 py-0.5">
								<span aria-hidden="true">{historyCount}</span>
								<span className="sr-only">
									{historyCount} history executions shown
								</span>
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
