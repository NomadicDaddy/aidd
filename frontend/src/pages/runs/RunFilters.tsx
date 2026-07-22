import type { RunMode, RunStatus } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass } from '../../lib/formStyles.ts';

export function RunFilters({
	historyProject,
	modeFilter,
	onClear,
	onHistoryProjectChange,
	onModeFilterChange,
	onQueryChange,
	onStatusFilterChange,
	projects,
	query,
	statusFilter,
}: {
	historyProject: string;
	modeFilter: 'all' | RunMode;
	onClear: () => void;
	onHistoryProjectChange: (value: string) => void;
	onModeFilterChange: (value: 'all' | RunMode) => void;
	onQueryChange: (value: string) => void;
	onStatusFilterChange: (value: 'all' | RunStatus) => void;
	projects: { id: string; name: string; path: string }[];
	query: string;
	statusFilter: 'all' | RunStatus;
}) {
	return (
		<Card className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_2fr_auto]">
			<select
				aria-label="Filter activity by project"
				className={selectClass}
				onChange={(event) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.project',
						source: 'RunsPage',
						summary: { filtered: event.target.value !== 'all' },
					});
					onHistoryProjectChange(event.target.value);
				}}
				value={historyProject}>
				<option value="all">All projects</option>
				{projects.map((project) => (
					<option key={project.id} value={project.path}>
						{project.name}
					</option>
				))}
			</select>
			<select
				aria-label="Filter runs by status"
				className={selectClass}
				onChange={(event) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.status',
						source: 'RunsPage',
						summary: { status: event.target.value },
					});
					onStatusFilterChange(event.target.value as 'all' | RunStatus);
				}}
				value={statusFilter}>
				<option value="all">All statuses</option>
				<option value="running">Running</option>
				<option value="completed">Completed</option>
				<option value="failed">Failed</option>
				<option value="stopped">Stopped</option>
				<option value="killed">Killed</option>
			</select>
			<select
				aria-label="Filter runs by mode"
				className={selectClass}
				onChange={(event) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.mode',
						source: 'RunsPage',
						summary: { mode: event.target.value },
					});
					onModeFilterChange(event.target.value as 'all' | RunMode);
				}}
				value={modeFilter}>
				<option value="all">All modes</option>
				<option value="coding">Coding</option>
				<option value="audit">Audit</option>
				<option value="director">Director</option>
				<option value="directive">Directive</option>
				<option value="interview">Interview</option>
				<option value="todo">Todo</option>
				<option value="triumvirate">Triumvirate</option>
				<option value="validate">Validate</option>
			</select>
			<Input
				aria-label="Search runs"
				data-shortcut-search=""
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder="Filter runs"
				value={query}
			/>
			<Button
				onClick={() => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.clear',
						source: 'RunsPage',
					});
					onClear();
				}}>
				Clear
			</Button>
		</Card>
	);
}
