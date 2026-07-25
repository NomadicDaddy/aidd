import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { ProjectPhase, ProjectSyncState } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { type MaturityFilter, maturityFilterLabels } from './projects-list-shared.ts';

export function ProjectsToolbar({
	allProjectsCount,
	hasFilters,
	maturityFilter,
	milestoneFilter,
	milestoneOptions,
	onResetFilters,
	onUpdateParam,
	phaseFilter,
	query,
	rootFilter,
	rootOptions,
	sortedCount,
	syncFilter,
}: {
	allProjectsCount: number;
	hasFilters: boolean;
	maturityFilter: MaturityFilter;
	milestoneFilter: string;
	milestoneOptions: string[];
	onResetFilters: () => void;
	onUpdateParam: (key: string, value: null | string) => void;
	phaseFilter: 'all' | ProjectPhase;
	query: string;
	rootFilter: string;
	rootOptions: { label: string; path: string }[];
	sortedCount: number;
	syncFilter: 'all' | ProjectSyncState;
}) {
	return (
		<Card className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_repeat(5,minmax(0,1fr))]">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Search</span>
					<div className="relative">
						<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
						<Input
							className="w-full pl-9"
							data-shortcut-search=""
							onChange={(event) => onUpdateParam('q', event.target.value)}
							placeholder="Filter by name or path"
							value={query}
						/>
					</div>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Root</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onUpdateParam('root', event.target.value)}
						value={rootFilter}>
						<option value="all">All roots</option>
						{rootOptions.map((root) => (
							<option key={root.path} value={root.path}>
								{root.label}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Milestone</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onUpdateParam('milestone', event.target.value)}
						value={milestoneFilter}>
						<option value="all">All milestones</option>
						{milestoneOptions.map((ms) => (
							<option key={ms} value={ms}>
								{ms}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Sync</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onUpdateParam('sync', event.target.value)}
						value={syncFilter}>
						<option value="all">All sync states</option>
						<option value="idle">Idle</option>
						<option value="syncing">Syncing</option>
						<option value="error">Error</option>
						<option value="unknown">Unknown</option>
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Phase</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onUpdateParam('phase', event.target.value)}
						value={phaseFilter}>
						<option value="all">All phases</option>
						<option value="initializer">Initializer</option>
						<option value="onboarding">Onboarding</option>
						<option value="coding">Coding</option>
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Maturity</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onUpdateParam('maturity', event.target.value)}
						value={maturityFilter}>
						<option value="all">{maturityFilterLabels.all}</option>
						<option value="incomplete">{maturityFilterLabels.incomplete}</option>
						<option value="specified">{maturityFilterLabels.specified}</option>
						<option value="structured">{maturityFilterLabels.structured}</option>
						<option value="mapped">{maturityFilterLabels.mapped}</option>
						<option value="planned">{maturityFilterLabels.planned}</option>
						<option value="engaged">{maturityFilterLabels.engaged}</option>
						<option value="audited">{maturityFilterLabels.audited}</option>
						<option value="shipped">{maturityFilterLabels.shipped}</option>
						<option value="complete">{maturityFilterLabels.complete}</option>
					</select>
				</label>
			</div>
			{hasFilters ? (
				<div className="flex items-center justify-between text-xs text-neutral-500">
					<span>
						Showing {sortedCount} of {allProjectsCount} projects
						{rootFilter !== 'all'
							? ` in ${rootOptions.find((root) => root.path === rootFilter)?.label ?? 'selected root'}`
							: ''}
					</span>
					<Button onClick={onResetFilters} variant="ghost">
						<X className="h-3 w-3" />
						Reset filters
					</Button>
				</div>
			) : null}
		</Card>
	);
}
