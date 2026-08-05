/* eslint-disable @typescript-eslint/no-floating-promises */
import { default as List } from 'lucide-react/dist/esm/icons/list';
import { default as PanelsTopLeft } from 'lucide-react/dist/esm/icons/panels-top-left';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonCards, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useProjects } from '../../hooks/useProjects.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { useTelemetryResources } from '../../hooks/useTelemetry.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { usePrefsStore } from '../../stores/prefsStore.ts';
import { autoParameters } from './recipe-parameters.ts';
import { RecipeCard, RecipeTable } from './RecipeGrid.tsx';
import { RecipeQuickLaunchPanel } from './RecipeQuickLaunchPanel.tsx';

function recipeMatches(recipe: RecipeDefinition, search: string): boolean {
	const query = search.trim().toLowerCase();
	if (!query) return true;
	return [recipe.id, recipe.name, recipe.description ?? '']
		.join(' ')
		.toLowerCase()
		.includes(query);
}

export function RecipesPage() {
	useDocumentTitle('Recipes');
	const navigate = useNavigate();
	const recipes = useRecipes();
	const projects = useProjects();
	const recipesView = usePrefsStore((state) => state.recipesView);
	const setRecipesView = usePrefsStore((state) => state.setRecipesView);
	const [search, setSearch] = useState('');
	const [projectDir, setProjectDir] = useState('');
	const [selectedRecipe, setSelectedRecipe] = useState<null | RecipeDefinition>(null);
	const [parameters, setParameters] = useState<Record<string, string>>({});
	const launchHintId = useId();

	const telemetry = useTelemetryResources({ type: 'recipe' });
	const usageByResourceId = new Map<string, ResourceUsageRow>(
		(telemetry.data ?? []).map((row) => [row.resourceId, row]),
	);

	const allRecipes = recipes.recipes.data ?? [];
	const filtered = allRecipes.filter((recipe) => recipeMatches(recipe, search));
	const launchDisabled = projectDir.length === 0;
	const launchProps = {
		launchDisabled,
		launchHintId,
		launchPending: recipes.launchRecipe.isPending,
		onLaunch: openLaunch,
	};

	function openLaunch(recipe: RecipeDefinition): void {
		const defaults: Record<string, string> = {};
		for (const parameter of recipe.parameters) {
			if (autoParameters.has(parameter.name)) continue;
			if (parameter.defaultValue !== undefined)
				defaults[parameter.name] = parameter.defaultValue;
		}
		setSelectedRecipe(recipe);
		setParameters(defaults);
	}

	function launchSelected(): void {
		if (!selectedRecipe) return;
		if (!projectDir) {
			toast.error('Select a project before launching');
			return;
		}
		recipes.launchRecipe.mutate(
			{ id: selectedRecipe.id, parameters, projectDir },
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
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					// `flex-nowrap` plus icon-only labels below `md`: at 768 the labels wrapped
					// mid-button and pushed the view toggle onto a second row.
					<div className="flex flex-nowrap items-center gap-2">
						<Button
							aria-label="New Recipe"
							onClick={() => {
								void navigate('/recipes/new');
							}}
							size="toolbar"
							variant="primary">
							<Plus className="h-4 w-4" />
							<span className="hidden md:inline">New Recipe</span>
						</Button>
						<Button
							aria-label="Reload recipes"
							disabled={recipes.reloadRecipes.isPending}
							onClick={reload}
							size="toolbar">
							<RefreshCw
								className={`h-4 w-4 ${
									recipes.reloadRecipes.isPending ? 'animate-spin' : ''
								}`}
							/>
							<span className="hidden md:inline">
								{recipes.reloadRecipes.isPending ? 'Reloading…' : 'Reload'}
							</span>
						</Button>
						<SegmentedControl
							ariaLabel="Recipe view"
							className="shrink-0"
							onChange={setRecipesView}
							options={[
								{
									ariaLabel: 'Card view',
									label: <PanelsTopLeft aria-hidden="true" className="h-4 w-4" />,
									title: 'Card view',
									value: 'cards',
								},
								{
									ariaLabel: 'Table view',
									label: <List aria-hidden="true" className="h-4 w-4" />,
									title: 'Table view',
									value: 'table',
								},
							]}
							value={recipesView}
						/>
					</div>
				}
				description="File-backed multi-step recipes from the local recipes directory."
				helpSlug="recipes"
				title="Recipes"
			/>

			<Card className="space-y-3">
				<div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
					<FieldRow label="Project">
						<select
							className={selectClass}
							onChange={(event) => setProjectDir(event.target.value)}
							value={projectDir}>
							<option value="">Launch target project</option>
							{(projects.data?.projects ?? []).map((project) => (
								<option key={project.id} value={project.path}>
									{project.name}
								</option>
							))}
						</select>
						{/* The prerequisite every disabled Launch button in the grid points at. */}
						{launchDisabled ? (
							<p className="text-xs text-muted-foreground" id={launchHintId}>
								Choose a project to enable Launch
							</p>
						) : null}
					</FieldRow>
					<FieldRow label="Search">
						<div className="relative">
							<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
							<Input
								className="pl-9"
								data-shortcut-search=""
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Filter recipes"
								value={search}
							/>
						</div>
					</FieldRow>
				</div>
				{/* The same count row the projects and features catalogs close with, so filtering
				    confirms itself instead of leaving a grid of unknown size. */}
				<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span>
						Showing {filtered.length} of {allRecipes.length} recipes
					</span>
					{search ? (
						<Button onClick={() => setSearch('')} variant="ghost">
							<X className="h-3 w-3" />
							Clear search
						</Button>
					) : null}
				</div>
			</Card>

			{selectedRecipe && (
				<RecipeQuickLaunchPanel
					launchDisabled={launchDisabled}
					launchPending={recipes.launchRecipe.isPending}
					onClose={() => setSelectedRecipe(null)}
					onLaunch={launchSelected}
					parameters={parameters}
					recipe={selectedRecipe}
					setParameters={setParameters}
				/>
			)}

			{recipes.recipes.isLoading && allRecipes.length === 0 ? (
				recipesView === 'table' ? (
					<SkeletonRows columns={7} count={6} label="Loading recipes…" />
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
						) : (
							<Button onClick={() => setSearch('')} variant="secondary">
								Clear search
							</Button>
						)
					}>
					{allRecipes.length === 0
						? 'No recipes found. Create a new recipe or add a recipe file under .aidd/recipes/ and reload.'
						: 'No recipes match the current search.'}
				</EmptyState>
			) : recipesView === 'table' ? (
				<RecipeTable
					recipes={filtered}
					usageByResourceId={usageByResourceId}
					{...launchProps}
				/>
			) : (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
		</div>
	);
}
