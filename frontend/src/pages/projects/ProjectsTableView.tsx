import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as ArrowUpDown } from 'lucide-react/dist/esm/icons/arrow-up-down';

import type { PortStatusEntry, ProjectGitStatusMapEntry, ProjectSummary } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { type SortDir, type SortKey } from './projects-list-sort.ts';
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

function SortHeader({
	activeDir,
	activeKey,
	label,
	onSort,
	sortKey,
}: {
	activeDir: SortDir;
	activeKey: SortKey;
	label: string;
	onSort: (key: SortKey) => void;
	sortKey: SortKey;
}) {
	const isActive = activeKey === sortKey;
	const Icon = isActive ? (activeDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
	return (
		<th className="px-3 py-3" scope="col">
			<button
				aria-label={`Sort by ${label}${isActive ? ` (${activeDir})` : ''}`}
				className={`inline-flex items-center gap-1 text-left uppercase ${
					isActive ? 'text-foreground' : 'text-muted-foreground'
				}`}
				onClick={() => onSort(sortKey)}
				type="button">
				{label}
				<Icon className="h-3 w-3" />
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
	const collisions = buildPortCollisionMap(projects);
	return (
		<Card className="overflow-x-auto p-0">
			<table aria-label="Projects" className="w-full text-left text-sm">
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Name"
							onSort={onToggleSort}
							sortKey="name"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Version"
							onSort={onToggleSort}
							sortKey="version"
						/>
						<th className="px-3 py-3" scope="col">
							Active runs
						</th>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Port"
							onSort={onToggleSort}
							sortKey="port"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Stack"
							onSort={onToggleSort}
							sortKey="stack"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Profile"
							onSort={onToggleSort}
							sortKey="profile"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Features"
							onSort={onToggleSort}
							sortKey="passing"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Reported Cost"
							onSort={onToggleSort}
							sortKey="reportedCost"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Tokens"
							onSort={onToggleSort}
							sortKey="tokens"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Maturity"
							onSort={onToggleSort}
							sortKey="maturity"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Artifacts"
							onSort={onToggleSort}
							sortKey="artifacts"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Git"
							onSort={onToggleSort}
							sortKey="git"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Last Web Run"
							onSort={onToggleSort}
							sortKey="lastSync"
						/>
						<SortHeader
							activeDir={sortDir}
							activeKey={sortKey}
							label="Added"
							onSort={onToggleSort}
							sortKey="addedAt"
						/>
					</tr>
				</thead>
				<tbody>
					{projects.map((project) => (
						<ProjectTableRow
							collisions={collisions}
							gitStatus={gitStatus?.[project.id]?.status}
							key={project.id}
							portStatus={portStatus?.[project.id]}
							project={project}
							spernakitTemplateVersion={spernakitTemplateVersion}
						/>
					))}
				</tbody>
			</table>
		</Card>
	);
}
