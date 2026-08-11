import type { PortStatusEntry, ProjectGitStatusMapEntry, ProjectSummary } from '../../api/types.ts';
import type { ProjectColumn } from './projects-table-columns.ts';

import { ColumnChooser } from '../../components/shared/ColumnChooser.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { SortableColumnHeader } from '../../components/shared/SortableColumnHeader.tsx';
import { Card } from '../../components/ui/card.tsx';
import { pinnedLeftEdgeClass, tableHeadClass } from '../../lib/tableStyles.ts';
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
	//
	// The data headers carry `projectTableCellClass`'s sizing half for the same reason the cells
	// do: under `table-layout: auto` a column is as wide as the widest of its header and its
	// cells, so capping only the body leaves 'Reported Cost' or 'Last Web Run' wrapping to two
	// lines while the column it heads has already collapsed to its content. NAME is again the
	// exception, and absorbs the slack.
	const className =
		column.key === 'name'
			? `sticky top-0 left-0 z-30 bg-muted px-3 py-3 ${pinnedLeftEdgeClass}`
			: 'sticky top-0 z-20 w-px bg-muted px-3 py-3 whitespace-nowrap';
	if (!sortKey) {
		return (
			<th className={className} scope="col">
				{column.label}
			</th>
		);
	}
	return (
		<SortableColumnHeader
			activeDir={activeDir}
			activeKey={activeKey}
			className={className}
			label={column.label}
			onSort={onSort}
			sortKey={sortKey}
		/>
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
					scrollerClassName="max-h-[calc(100dvh-16rem)] overflow-y-auto">
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
