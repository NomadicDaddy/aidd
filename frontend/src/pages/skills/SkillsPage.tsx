import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as Upload } from 'lucide-react/dist/esm/icons/upload';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ResourceUsageRow } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';
import type { SkillDefinition } from '../../api/types/skills.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LaunchForm } from '../../components/shared/LaunchForm.tsx';
import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { AlertDialog } from '../../components/ui/alert-dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjects } from '../../hooks/useProjects.ts';
import { useSkillImports, useSkills } from '../../hooks/useSkills.ts';
import { useTelemetryResources } from '../../hooks/useTelemetry.ts';
import { SKILL_CATEGORY_FILTERS, type SkillCategoryFilter } from '../../lib/catalogCuration.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { SkillCatalog } from './SkillCatalog.tsx';
import { SkillDetailsCard } from './SkillDetailsCard.tsx';
import { SkillImportDialog } from './SkillImportDialog.tsx';

export function SkillsPage() {
	useDocumentTitle('Skills');
	const { runSkill, skills } = useSkills();
	const { deleteImport } = useSkillImports();
	const projects = useProjects();
	const telemetry = useTelemetryResources({ type: 'skill' });
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState<SkillCategoryFilter>('all');
	const [deleteTarget, setDeleteTarget] = useState<null | string>(null);
	const [importOpen, setImportOpen] = useState(false);
	const [selectedId, setSelectedId] = useState<null | string>(null);
	const [args, setArgs] = useState('');
	const [executionIntent, setExecutionIntent] = useState<SkillExecutionIntent>('review-only');
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [projectDir, setProjectDir] = useState('');

	const skillList = skills.data ?? [];
	const usageByResourceId = new Map<string, ResourceUsageRow>(
		(telemetry.data ?? []).map((row) => [row.resourceId, row]),
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
		<div className="page-reveal space-y-4">
			<PageHeader
				actions={
					<Button onClick={() => setImportOpen(true)} size="toolbar" variant="secondary">
						<Upload aria-hidden="true" className="h-4 w-4" />
						Import skill
					</Button>
				}
				description="Run aidd-local skill definitions directly or compose them in recipes."
				helpSlug="skills"
				title="Skills"
			/>
			{/* Filters belong above the split, not inside the 18–24rem catalog column: in there the
			    seven category segments wrapped onto three rows and spent ~110px before a single
			    skill was shown. This is the same full-width filter Card /recipes and /telemetry use. */}
			<Card className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-end">
				<div className="relative">
					<Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
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
			</Card>
			<div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
				<SkillCatalog
					loading={skills.isLoading}
					onSelect={setSelectedId}
					selectedId={selected?.id ?? null}
					skills={filtered}
					total={skillList.length}
					usageByResourceId={usageByResourceId}
				/>
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
							<CardHeader className="mb-0" headingLevel={3} title="Definition" />
							{/* SKILL.md is a markdown document and is now read as one. It was the last
							    surface showing raw source: monospaced, reflowed mid-word to keep it
							    on screen, with its `##` and `-` markers left as literal characters —
							    the operator was reading the file rather than the document, and its
							    headings were nowhere in the accessibility tree. Its own `#` title is
							    dropped because the catalog names the skill above this card. */}
							<div className="max-h-[28rem] overflow-auto">
								<MarkdownContent
									baseLevel={4}
									className={proseMeasureClass}
									markdown={selected.body}
									skipLeadingTitle
								/>
							</div>
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
			<SkillImportDialog onClose={() => setImportOpen(false)} open={importOpen} />
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
								error instanceof Error ? error.message : 'Skill deletion failed',
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
