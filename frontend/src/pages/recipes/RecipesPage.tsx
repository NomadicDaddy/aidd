/* eslint-disable @typescript-eslint/no-floating-promises */
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonCards, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjectNames } from '../../hooks/useProjects.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { useTelemetryResources } from '../../hooks/useTelemetry.ts';
import { catalogFilterSearchParams, readCatalogQuery } from '../../lib/catalogFilterParams.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { filterRegister } from '../../lib/filterFields.ts';
import { usePrefsStore } from '../../stores/prefsStore.ts';
import { recipeLaunchBlocker, resolveRecipeLaunchProject } from './recipe-launch.ts';
import { autoParameters } from './recipe-parameters.ts';
import { RecipeCard, RecipeTable } from './RecipeGrid.tsx';
import { RecipeQuickLaunchPanel } from './RecipeQuickLaunchPanel.tsx';
import { RecipesFilterToolbar } from './RecipesFilterToolbar.tsx';
import { RecipesPageActions } from './RecipesPageActions.tsx';

const PAGE_RAIL = pageRailByContentType.catalog;

function recipeMatches(recipe: RecipeDefinition, search: string): boolean {
	const query = search.trim().toLowerCase();
	if (!query) return true;
	const content = [recipe.id, recipe.name, recipe.description ?? ''].join(' ').toLowerCase();
	return content.includes(query);
}

export function RecipesPage() {
	useDocumentTitle('Recipes');
	const navigate = useNavigate();
	const recipes = useRecipes();
	const projects = useProjectNames();
	const recipesView = usePrefsStore((state) => state.recipesView);
	const setRecipesView = usePrefsStore((state) => state.setRecipesView);
	const [searchParams, setSearchParams] = useSearchParams();
	// Search is URL-backed for sharing and history; launch state remains local.
	const search = readCatalogQuery(searchParams);
	const [projectDir, setProjectDir] = useState('');
	const [selectedRecipe, setSelectedRecipe] = useState<null | RecipeDefinition>(null);
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [parameters, setParameters] = useState<Record<string, string>>({});
	const launchTriggerRef = useRef<HTMLButtonElement | null>(null);
	const launchHintId = useId();
	const launchPanelId = useId();

	const telemetry = useTelemetryResources({ type: 'recipe' });
	const usageByResourceId = new Map<string, ResourceUsageRow>(
		(telemetry.data ?? []).map((row) => [row.resourceId, row]),
	);

	const allRecipes = recipes.recipes.data ?? [];
	const filtered = allRecipes.filter((recipe) => recipeMatches(recipe, search));
	// An empty catalog and a search that matched nothing are different answers with different
	// remedies: the first offers the two actions that create a recipe, the second names the search
	// and clears it. Only the second gets a register, so the first cannot offer to reset nothing.
	const emptyFilters =
		allRecipes.length === 0
			? undefined
			: filterRegister(
					() => setSearch(''),
					[search.trim() !== '' && { label: 'Search', value: search.trim() }],
				);
	const projectOptions = projects.data?.projects ?? [];
	const targetProject = resolveRecipeLaunchProject(projectOptions, projectDir);
	const launchDisabled = targetProject === null;
	const selectedLaunchBlocker = selectedRecipe
		? recipeLaunchBlocker(selectedRecipe, parameters, targetProject?.path ?? '')
		: null;
	const launchProps = {
		activeRecipeId: selectedRecipe?.id ?? null,
		launchDisabled,
		launchHintId,
		launchPanelId,
		launchPending: recipes.launchRecipe.isPending,
		onLaunch: openLaunch,
	};

	function setSearch(value: string): void {
		setSearchParams((previous) => catalogFilterSearchParams(previous, { q: value }), {
			replace: true,
		});
	}

	function openLaunch(recipe: RecipeDefinition, trigger: HTMLButtonElement): void {
		const defaults: Record<string, string> = {};
		for (const parameter of recipe.parameters) {
			if (autoParameters.has(parameter.name)) continue;
			if (parameter.defaultValue !== undefined)
				defaults[parameter.name] = parameter.defaultValue;
		}
		launchTriggerRef.current = trigger;
		setSelectedRecipe(recipe);
		setLaunchTarget({});
		setParameters(defaults);
	}

	function closeLaunch(): void {
		setSelectedRecipe(null);
		launchTriggerRef.current?.focus();
	}

	function launchSelected(): void {
		if (!selectedRecipe) return;
		if (!targetProject) {
			toast.error('Choose a project before starting this recipe.');
			return;
		}
		if (selectedLaunchBlocker) {
			toast.error(selectedLaunchBlocker);
			return;
		}
		recipes.launchRecipe.mutate(
			{ id: selectedRecipe.id, launchTarget, parameters, projectDir: targetProject.path },
			{
				onSuccess: (session) => {
					toast.success('Pipeline session started');
					// Land in the unified Runs feed with the new session selected and expanded;
					// the per-session report stays a click away from there.
					navigate(`/runs?pipeline=${encodeURIComponent(session.id)}`);
				},
			},
		);
	}

	function reload(): void {
		recipes.reloadRecipes.mutate(undefined, {
			onSuccess: () => toast.success('Recipes reloaded'),
		});
	}

	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					<RecipesPageActions
						onNew={() => {
							void navigate('/recipes/new');
						}}
						onReload={reload}
						recipesView={recipesView}
						reloading={recipes.reloadRecipes.isPending}
						setRecipesView={setRecipesView}
					/>
				}
				description="File-backed recipes from the local recipes directory."
				helpSlug="recipes"
				title="Recipes"
			/>

			<RecipesFilterToolbar
				filtered={filtered.length}
				launchHintId={launchHintId}
				onProjectChange={setProjectDir}
				onReset={() => setSearch('')}
				onSearchChange={setSearch}
				projectDir={projectDir}
				projects={projectOptions}
				search={search}
				total={allRecipes.length}
			/>

			{selectedRecipe && (
				<RecipeQuickLaunchPanel
					launchBlockedBy={selectedLaunchBlocker}
					launchPending={recipes.launchRecipe.isPending}
					launchTarget={launchTarget}
					onClose={closeLaunch}
					onLaunch={launchSelected}
					onLaunchTargetChange={setLaunchTarget}
					panelId={launchPanelId}
					parameters={parameters}
					projectDir={projectDir}
					projects={projectOptions}
					recipe={selectedRecipe}
					setParameters={setParameters}
					setProjectDir={setProjectDir}
				/>
			)}

			{recipes.recipes.isLoading && allRecipes.length === 0 ? (
				recipesView === 'table' ? (
					<SkeletonRows columns={8} count={6} label="Loading recipes…" />
				) : (
					<SkeletonCards count={6} label="Loading recipes…" />
				)
			) : filtered.length === 0 ? (
				<EmptyState
					action={
						allRecipes.length === 0 ? (
							<div className="flex items-center gap-2">
								<Button
									onClick={() => {
										void navigate('/recipes/new');
									}}
									variant="primary">
									<Plus className="h-4 w-4" />
									New Recipe
								</Button>
								<Button
									disabled={recipes.reloadRecipes.isPending}
									onClick={reload}
									variant="secondary">
									<RefreshCw className="h-4 w-4" />
									Reload recipes
								</Button>
							</div>
						) : null
					}
					filterReset="toolbar"
					filters={emptyFilters}>
					{allRecipes.length === 0
						? "No recipes found. Create a new recipe or add a recipe file under aidd's local recipes/ directory and reload."
						: 'No recipes match the current search.'}
				</EmptyState>
			) : recipesView === 'table' ? (
				<RecipeTable
					recipes={filtered}
					usageByResourceId={usageByResourceId}
					{...launchProps}
				/>
			) : (
				// Match the Projects gutter; auto-fill keeps cards below ~490px on wide screens.
				<div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
					{filtered.map((recipe) => (
						<RecipeCard
							key={recipe.id}
							recipe={recipe}
							usage={usageByResourceId.get(recipe.id)}
							{...launchProps}
						/>
					))}
				</div>
			)}
		</PageRail>
	);
}
