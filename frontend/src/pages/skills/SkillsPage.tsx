import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as Upload } from 'lucide-react/dist/esm/icons/upload';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ResourceUsageRow } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';
import type { SkillDefinition } from '../../api/types/skills.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LaunchForm } from '../../components/shared/LaunchForm.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { AlertDialog } from '../../components/ui/alert-dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjects } from '../../hooks/useProjects.ts';
import { useSkillImports, useSkills } from '../../hooks/useSkills.ts';
import { useTelemetryResources } from '../../hooks/useTelemetry.ts';
import { useViewportFill } from '../../hooks/useViewportFill.ts';
import { SKILL_CATEGORY_FILTERS, type SkillCategoryFilter } from '../../lib/catalogCuration.ts';
import { cn } from '../../lib/cn.ts';
import { SkillCatalog } from './SkillCatalog.tsx';
import { SkillDefinitionCard } from './SkillDefinitionCard.tsx';
import { SkillDetailsCard } from './SkillDetailsCard.tsx';
import { SkillImportDialog } from './SkillImportDialog.tsx';
import { useSkillsMasterDetail } from './useSkillsMasterDetail.ts';

/**
 * The content width at which the catalog and the detail stop being alternatives and become columns.
 *
 * 40rem = 640px: the catalog column takes up to 20rem of that, and below roughly this the detail is
 * left with less than a readable measure. It matches `@min-[40rem]:` in the markup below and is
 * compared against the region's measured width, never the viewport's — at 768px of viewport the
 * content column is 656px with the sidebar rail collapsed and 480px with it expanded.
 */
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
	const [args, setArgs] = useState('');
	const [executionIntent, setExecutionIntent] = useState<SkillExecutionIntent>('review-only');
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [projectDir, setProjectDir] = useState('');
	const splitRef = useViewportFill<HTMLDivElement>();
	const {
		backButtonRef,
		catalogHasSelection,
		clearSelection,
		selectedId,
		selectSkill,
		showCatalog,
		showDetail,
	} = useSkillsMasterDetail(splitRef);

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
	const catalogSelectedId = catalogHasSelection ? (selected?.id ?? null) : null;

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

	const emptyDetail =
		skillList.length === 0 ? (
			<EmptyState>No aidd-local skills were found.</EmptyState>
		) : category === 'all' ? (
			<EmptyState action={clearAction}>
				No skills match this search. Clear filters to view skill details.
			</EmptyState>
		) : (
			<EmptyState action={clearAction}>
				No skills match the selected category filter. Clear filters to view skill details.
			</EmptyState>
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
			<Card className="@container">
				{/* Gated on the card's own interior, not the viewport — the same reason the shared
				    `FilterToolbar` warns against `lg:`. The rail expands at exactly 1024px, so `lg:`
				    split this card in two at the one width where the content column is 735px: the
				    seven segments wrapped onto three rows in the `1fr` track and `items-end` left the
				    search field sitting under ~90px of nothing. 62rem is what the pair actually needs
				    — a 20rem search, the gap, and the ~640px the segments measure unwrapped — so
				    below it they stack and the segments wrap across the full card instead. */}
				<div className="grid gap-3 @min-[62rem]:grid-cols-[minmax(0,20rem)_1fr] @min-[62rem]:items-end">
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
					{/* `justify-self-start`: the track is already `w-auto`, but as a grid item it was
					    being stretched to the full `1fr` and the seven segments spread across 1400px
					    of a 2250 screen — a control that sizes to its content, stretched by the thing
					    holding it. The search Input beside it is the one that wants its whole track. */}
					<SegmentedControl
						ariaLabel="Filter skills by category"
						className="max-w-full @min-[62rem]:justify-self-start"
						onChange={setCategory}
						options={SKILL_CATEGORY_FILTERS}
						value={category}
					/>
				</div>
			</Card>
			{/* Above the split the region is the scrolling one and the page is not. The detail column
			    had no scrollport at all, so the document scrolled instead — which is why the rail's
			    sticky never engaged in any of the 76 states the sweep measured: 144px of available
			    page scroll against the 172px sticky needs. The height is measured rather than
			    guessed; see useViewportFill.

			    The gate is a container query, not a viewport breakpoint: the thing that has to fit
			    is the content column, and the sidebar rail sets its width independently of the
			    viewport — 768px of viewport is 656px of column with the rail collapsed and 480px
			    with it expanded, and both states occur. `lg:` gated on the one number that does
			    not describe this layout. This wrapper is the container, the query its child. */}
			<div className="@container">
				{/* The explicit row track, not just the height: an implicit `auto` row sizes to its
				    content (5390px measured), so `overflow-auto` below had nothing to overflow. */}
				<div
					// The index yields and the work surface keeps the remainder. `minmax(18rem,24rem)`
					// pinned the catalog at its 384px maximum at every desktop width, so at a 736px
					// content column the 76-row picker was wider than the pane holding the launch
					// form and the whole SKILL.md — the list of things to choose from was given more
					// room than the thing chosen. A 20rem cap fits a title, a summary line and an id
					// without wrapping any of them, and every pixel above that goes to the document.
					className="grid min-w-0 gap-4 @min-[40rem]:h-[var(--fill-height,calc(100vh-12rem))] @min-[40rem]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @min-[40rem]:grid-rows-[minmax(0,1fr)] @min-[40rem]:overflow-hidden"
					ref={splitRef}>
					<SkillCatalog
						activeId={selected?.id ?? null}
						className={showDetail ? 'hidden @min-[40rem]:flex' : undefined}
						loading={skills.isLoading}
						onSelect={selectSkill}
						selectedId={catalogSelectedId}
						skills={filtered}
						total={skillList.length}
						usageByResourceId={usageByResourceId}
					/>
					{selected ? (
						// The scrollport the list-plus-detail pattern claims. Everything that scrolls
						// on this surface now scrolls in here or in the rail beside it.
						//
						// Below the split the two panes are alternatives rather than columns. They
						// were stacked before, so the catalog ran 5850px down the document and the
						// detail began past the end of it: tapping the 30th of 76 skills swapped
						// content 3962px below the fold, which is indistinguishable from a tap that
						// did nothing.
						<div
							className={cn(
								'min-w-0 space-y-4 @min-[40rem]:h-full @min-[40rem]:overflow-auto @min-[40rem]:pr-1',
								showDetail ? undefined : 'hidden @min-[40rem]:block',
							)}>
							{/* Reached before any of the detail is scrolled, because a way back that
							    is 2000px down the document is not a way back. */}
							<Button
								className="@min-[40rem]:hidden"
								onClick={() => showCatalog(selected.id)}
								ref={backButtonRef}
								size="toolbar"
								variant="secondary">
								<ArrowLeft aria-hidden="true" className="h-4 w-4" />
								All skills
							</Button>
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
							<SkillDefinitionCard body={selected.body} />
						</div>
					) : (
						// Only above the split. Below it the catalog occupies the whole region and says
						// the same thing in its own empty state, so this one would be a second copy of
						// the message stacked under the first.
						<div className="hidden @min-[40rem]:block">{emptyDetail}</div>
					)}
				</div>
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
							clearSelection();
						},
					});
				}}
				open={deleteTarget !== null}
				title={`Delete ${deleteTarget ?? 'imported skill'}?`}
			/>
		</div>
	);
}
