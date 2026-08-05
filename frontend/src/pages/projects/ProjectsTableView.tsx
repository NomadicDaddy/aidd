import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as ArrowUpDown } from 'lucide-react/dist/esm/icons/arrow-up-down';

import type { PortStatusEntry, ProjectGitStatusMapEntry, ProjectSummary } from '../../api/types.ts';
import type { ProjectColumn } from './projects-table-columns.ts';

import { ColumnChooser } from '../../components/shared/ColumnChooser.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Card } from '../../components/ui/card.tsx';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { usePrefsStore } from '../../stores/prefsStore.ts';
import { type SortDir, type SortKey } from './projects-list-sort.ts';
import {
	optionalProjectColumns,
	readOptionalColumns,
	visibleProjectColumns,
} from './projects-table-columns.ts';
import { ProjectTableRow } from './ProjectTableRow.tsx';

function buildPortCollisionMap(projects: ProjectSummary[]): {
	backend: Map<number, string[]>;
	frontend: Map<number, string[]>;
} {
	const frontend = new Map<number, string[]>();
	const backend = new Map<number, string[]>();
	for (const project of projects) {
		const ports = project.metadata.ports;
		if (!ports) continue;
		if (typeof ports.frontendPort === 'number') {
			const list = frontend.get(ports.frontendPort) ?? [];
			list.push(project.name);
			frontend.set(ports.frontendPort, list);
		}
		if (typeof ports.backendPort === 'number') {
			const list = backend.get(ports.backendPort) ?? [];
			list.push(project.name);
			backend.set(ports.backendPort, list);
		}
	}
	return { backend, frontend };
}

function ColumnHeader({
	activeDir,
	activeKey,
	column,
	onSort,
}: {
	activeDir: SortDir;
	activeKey: SortKey;
	column: ProjectColumn;
	onSort: (key: SortKey) => void;
}) {
	const sortKey = column.sortKey;
	// Matches the pinned identity `<td>` in ProjectTableRow. The header needs its own opaque
	// `bg-muted` — the one on `<thead>` does not paint under a sticky child — and a higher
	// z-index than the body cells so it stays above them at the intersection.
	const className =
		column.key === 'name'
			? 'sticky top-0 left-0 z-30 bg-muted px-3 py-3'
			: 'sticky top-0 z-20 bg-muted px-3 py-3';
	if (!sortKey) {
		return (
			<th className={className} scope="col">
				{column.label}
			</th>
		);
	}
	const isActive = activeKey === sortKey;
	const Icon = isActive ? (activeDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
	return (
		<th
			aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
			className={className}
			scope="col">
			<button
				aria-label={`Sort by ${column.label}${isActive ? ` (${activeDir})` : ''}`}
				className={`inline-flex items-center gap-1 text-left uppercase ${
					isActive ? 'text-foreground' : 'text-muted-foreground'
				}`}
				onClick={() => onSort(sortKey)}
				type="button">
				{column.label}
				<Icon aria-hidden="true" className="h-3 w-3" />
			</button>
		</th>
	);
}

export function ProjectsTableView({
	gitStatus,
	onToggleSort,
	portStatus,
	projects,
	sortDir,
	sortKey,
	spernakitTemplateVersion = null,
}: {
	gitStatus: Record<string, ProjectGitStatusMapEntry> | undefined;
	onToggleSort: (key: SortKey) => void;
	portStatus: Record<string, PortStatusEntry> | undefined;
	projects: ProjectSummary[];
	sortDir: SortDir;
	sortKey: SortKey;
	spernakitTemplateVersion?: null | string;
}) {
	const storedColumns = usePrefsStore((state) => state.projectTableColumns);
	const setStoredColumns = usePrefsStore((state) => state.setProjectTableColumns);
	const enabled = new Set<string>(readOptionalColumns(storedColumns));
	const columns = visibleProjectColumns(enabled);
	const collisions = buildPortCollisionMap(projects);

	return (
		<div className="space-y-2">
			<div className="flex justify-end">
				<ColumnChooser
					onReset={() => setStoredColumns([])}
					onToggle={(key) => {
						const next = new Set(enabled);
						if (next.has(key)) next.delete(key);
						else next.add(key);
						setStoredColumns(readOptionalColumns([...next]));
					}}
					options={optionalProjectColumns}
					selected={enabled}
				/>
			</div>
			<Card className="p-0">
				<OverflowScroller
					ariaLabel="Projects table"
					scrollerClassName="max-h-[70vh] overflow-y-auto">
					<table aria-label="Projects" className="w-full text-left text-sm">
						<thead className={tableHeadClass}>
							<tr>
								{columns.map((column) => (
									<ColumnHeader
										activeDir={sortDir}
										activeKey={sortKey}
										column={column}
										key={column.key}
										onSort={onToggleSort}
									/>
								))}
							</tr>
						</thead>
						<tbody>
							{projects.map((project) => (
								<ProjectTableRow
									collisions={collisions}
									gitStatus={gitStatus?.[project.id]?.status}
									key={project.id}
									optionalColumns={enabled}
									portStatus={portStatus?.[project.id]}
									project={project}
									spernakitTemplateVersion={spernakitTemplateVersion}
								/>
							))}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>
		</div>
	);
}
