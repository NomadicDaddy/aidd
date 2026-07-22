import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ResourceUsageRow } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';
import type { SkillDefinition } from '../../api/types/skills.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LaunchForm } from '../../components/shared/LaunchForm.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { AlertDialog } from '../../components/ui/alert-dialog.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjects } from '../../hooks/useProjects.ts';
import { useSkillImports, useSkills } from '../../hooks/useSkills.ts';
import { useTelemetryResources } from '../../hooks/useTelemetry.ts';
import {
	MATURITY_SKILL_IDS,
	RECIPE_SKILL_IDS,
	SKILL_CATEGORY_FILTERS,
	type SkillCategoryFilter,
} from '../../lib/catalogCuration.ts';
import { formatUsageBadge } from '../../lib/usageBadge.ts';
import { SkillDetailsCard } from './SkillDetailsCard.tsx';
import { SkillImportPanel } from './SkillImportPanel.tsx';

function skillSummary(skill: SkillDefinition): string {
	return skill.description || skill.usage || skill.title;
}

export function SkillsPage() {
	useDocumentTitle('Skills');
	const { runSkill, skills } = useSkills();
	const { deleteImport } = useSkillImports();
	const projects = useProjects();
	const telemetry = useTelemetryResources({ type: 'skill' });
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState<SkillCategoryFilter>('all');
	const [deleteTarget, setDeleteTarget] = useState<null | string>(null);
	const [selectedId, setSelectedId] = useState<null | string>(null);
	const [args, setArgs] = useState('');
	const [executionIntent, setExecutionIntent] = useState<SkillExecutionIntent>('review-only');
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [projectDir, setProjectDir] = useState('');

	const skillList = skills.data ?? [];
	const usageByResourceId = new Map<string, ResourceUsageRow>(
		(telemetry.data ?? []).map((row) => [row.resourceId, row])
	);
	const normalizedQuery = query.trim().toLowerCase();
	const filtered = skillList.filter((skill) => {
		if (category !== 'all' && skill.category !== category) return false;
		if (!normalizedQuery) return true;
		return [skill.id, skill.title, skill.description]
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
	});
	const selected = filtered.find((skill) => skill.id === selectedId) ?? filtered[0] ?? null;

	function clearFilters(): void {
		setQuery('');
		setCategory('all');
	}

	function launch(skill: SkillDefinition): void {
		if (!projectDir) return;
		const request = {
			args,
			executionIntent,
			projectDir,
			skillId: skill.id,
			...(launchTarget.backend ? { backend: launchTarget.backend } : {}),
			...(launchTarget.model ? { model: launchTarget.model } : {}),
			...(launchTarget.reasoningEffort
				? { reasoningEffort: launchTarget.reasoningEffort }
				: {}),
		};
		runSkill.mutate(request, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Skill launch failed');
			},
			onSuccess(session) {
				toast.success(`Launched ${skill.id} (${session.id})`);
			},
		});
	}

	const clearAction = (
		<Button onClick={clearFilters} variant="secondary">
			Clear filters
		</Button>
	);

	return (
		<div className="space-y-4">
			<PageHeader
				description="Run aidd-local skill definitions directly or compose them in recipes."
				helpSlug="skills"
				title="Skills"
			/>
			<SkillImportPanel />
			<div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
				<Card className="min-w-0 space-y-3">
					<div className="relative">
						<Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-neutral-400" />
						<Input
							aria-label="Search skills"
							className="pl-8"
							data-shortcut-search=""
							name="skillSearch"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Filter skills"
							value={query}
						/>
					</div>
					<SegmentedControl
						ariaLabel="Filter skills by category"
						className="max-w-full"
						onChange={setCategory}
						options={SKILL_CATEGORY_FILTERS}
						value={category}
					/>
					<div className="max-h-[34rem] space-y-1 overflow-auto pr-1">
						{skills.isLoading && skillList.length === 0 ? (
							<div className="space-y-2 p-1">
								{Array.from({ length: 6 }).map((_, index) => (
									<div
										className="space-y-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
										key={index}>
										<SkeletonLines count={2} label="Loading skills…" />
									</div>
								))}
							</div>
						) : null}
						{filtered.map((skill) => {
							const usageLine = formatUsageBadge(usageByResourceId.get(skill.id));
							return (
								<button
									className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
										skill.id === selected?.id
											? 'border-cyan-300 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/30'
											: 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900'
									}`}
									key={skill.id}
									onClick={() => setSelectedId(skill.id)}
									type="button">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-sm text-neutral-950 dark:text-neutral-50">
											{skill.id}
										</span>
										{RECIPE_SKILL_IDS.has(skill.id) ? (
											<Badge tone="cyan">Recipe</Badge>
										) : null}
										{MATURITY_SKILL_IDS.has(skill.id) ? (
											<Badge tone="emerald">Maturity</Badge>
										) : null}
										<Badge
											tone={
												skill.origin === 'imported' ? 'amber' : 'neutral'
											}>
											{skill.origin}
										</Badge>
									</div>
									<p className="mt-1 line-clamp-2 text-xs text-neutral-500">
										{skillSummary(skill)}
									</p>
									{usageLine ? (
										<p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
											{usageLine}
										</p>
									) : null}
								</button>
							);
						})}
						{!skills.isLoading && filtered.length === 0 ? (
							<EmptyState>
								{skillList.length === 0
									? 'No skills available.'
									: category !== 'all'
										? 'No skills in this category.'
										: 'No skills match your search.'}
							</EmptyState>
						) : null}
					</div>
				</Card>
				{selected ? (
					<div className="min-w-0 space-y-4">
						<SkillDetailsCard
							onDelete={() => setDeleteTarget(selected.id)}
							skill={selected}
						/>
						<LaunchForm
							args={args}
							executionIntent={executionIntent}
							launchLabel={
								executionIntent === 'review-only'
									? 'Run review-only directive'
									: 'Run changes-allowed directive'
							}
							launchPending={runSkill.isPending}
							launchTarget={launchTarget}
							onExecutionIntentChange={setExecutionIntent}
							onLaunch={() => launch(selected)}
							onLaunchTargetChange={setLaunchTarget}
							projectDir={projectDir}
							projects={projects.data?.projects ?? []}
							setArgs={setArgs}
							setProjectDir={setProjectDir}
						/>
						<Card className="space-y-2">
							<h3 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
								Definition
							</h3>
							<pre className="max-h-[28rem] overflow-auto rounded-md bg-neutral-100 p-3 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
								{selected.body}
							</pre>
						</Card>
					</div>
				) : skillList.length === 0 ? (
					<EmptyState>No aidd-local skills were found.</EmptyState>
				) : category !== 'all' ? (
					<EmptyState action={clearAction}>
						No skills match the selected category filter. Clear filters to view skill
						details.
					</EmptyState>
				) : (
					<EmptyState action={clearAction}>
						No skills match this search. Clear filters to view skill details.
					</EmptyState>
				)}
			</div>
			<AlertDialog
				description="Deletion is blocked when a recipe or maturity action still references this skill."
				destructive
				isPending={deleteImport.isPending}
				onClose={() => setDeleteTarget(null)}
				onConfirm={() => {
					if (!deleteTarget) return;
					deleteImport.mutate(deleteTarget, {
						onError: (error) =>
							toast.error(
								error instanceof Error ? error.message : 'Skill deletion failed'
							),
						onSuccess: () => {
							toast.success(`${deleteTarget} deleted`);
							setDeleteTarget(null);
							setSelectedId(null);
						},
					});
				}}
				open={deleteTarget !== null}
				title={`Delete ${deleteTarget ?? 'imported skill'}?`}
			/>
		</div>
	);
}
