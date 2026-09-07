import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StepDraft } from '../../frontend/src/pages/recipes/recipe-steps.ts';

import {
	collectStepErrors,
	newStepDraft,
	newStepNamePlaceholder,
	stepConfigPlaceholder,
	stepNameErrorForDisplay,
} from '../../frontend/src/pages/recipes/recipe-steps.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

describe('the recipes catalog spends emphasis on the committing action', () => {
	test('row launches are secondary disclosures tied to one modal', async () => {
		const [button, form, grid, page, panel] = await Promise.all([
			read('pages/recipes/RecipeLaunchButton.tsx'),
			read('pages/recipes/RecipeLaunchForm.tsx'),
			read('pages/recipes/RecipeGrid.tsx'),
			read('pages/recipes/RecipesPage.tsx'),
			read('pages/recipes/RecipeQuickLaunchPanel.tsx'),
		]);

		expect(button).toContain('aria-controls={launchPanelId}');
		expect(button).toContain('aria-expanded={launchPanelId ? activeRecipeId === recipe.id');
		expect(button).toContain('variant="primary"');
		expect(grid).toContain('launch.activeRecipeId === recipe.id');
		expect(grid).toContain('border-accent/40 ring-1 ring-accent/30');
		expect(page).toContain('activeRecipeId: selectedRecipe?.id ?? null');
		expect(page).toContain('launchPanelId');
		expect(form).toContain('variant="primary"');
		expect(panel).toContain('<Dialog');
		expect(panel).toContain('id={panelId}');
	});

	test('project readiness is required, stable, and attention-toned', async () => {
		const [field, page, toolbar] = await Promise.all([
			read('pages/recipes/RecipeProjectField.tsx'),
			read('pages/recipes/RecipesPage.tsx'),
			read('pages/recipes/RecipesFilterToolbar.tsx'),
		]);

		expect(field).toContain('<FieldRow label={label} required>');
		expect(field).toContain('<option value="">Select target project</option>');
		expect(toolbar).toContain('label="Launch target project"');
		expect(toolbar).toContain('describedBy={launchHintId}');
		expect(toolbar).toContain('Launch actions use this project as their target.');
		expect(page).not.toContain("launchDisabled ? toneText.amber : 'invisible'");
	});

	test('catalog cards share a fill rule and table badge columns stay bounded', async () => {
		const [grid, page, skillCatalog] = await Promise.all([
			read('pages/recipes/RecipeGrid.tsx'),
			read('pages/recipes/RecipesPage.tsx'),
			read('pages/skills/SkillCatalog.tsx'),
		]);

		expect(page).not.toContain('items-start gap-4');
		expect(grid).toContain("'flex h-full flex-col'");
		expect(grid).toContain('className="mt-auto mb-3');
		expect(grid).toContain('className="flex flex-wrap gap-2 border-t');
		expect(grid).toContain("{usageLine ?? '—'}");
		expect(grid).toContain('className={contentSizedTableClass}');
		expect(grid.match(/contentSizedColumnClass/g)?.length).toBeGreaterThanOrEqual(7);
		expect(skillCatalog).toContain('@min-[40rem]:max-h-full');
		expect(grid).not.toContain('w-44 max-w-44');
		expect(grid).not.toContain('w-52 max-w-52');
	});

	test('catalog hierarchy keeps launch state outside filters and aligns shared view language', async () => {
		const [actions, grid, toolbar] = await Promise.all([
			read('pages/recipes/RecipesPageActions.tsx'),
			read('pages/recipes/RecipeGrid.tsx'),
			read('pages/recipes/RecipesFilterToolbar.tsx'),
		]);

		expect(toolbar).toContain('header={');
		expect(toolbar).not.toContain('tableMeasureClass');
		expect(toolbar).not.toContain('<RecipeProjectField\n\t\t\t\tonChange=');
		expect(actions).toContain("icons/grid-2-x-2'");
		expect(actions).toContain("ariaLabel: 'Table view'");
		expect(grid).toContain('<RecipeTypeBadge isPipeline={isPipeline} plain />');
		expect(grid).toContain('<RecipeContractBadges plain recipe={recipe} />');
		expect(grid).not.toContain('actionLayout="stacked"');
	});
});

describe('recipe launch accounts for every parameter', () => {
	test('mixed auto parameters and machine labels preserve their authored casing', async () => {
		const fields = await read('pages/recipes/RecipeLaunchFields.tsx');

		expect(fields).toContain('filledParameters.map((parameter) => parameter.name).join');
		expect(fields).toContain('filled from the selected project.');
		expect(fields).toContain('col-span-full');
		expect(fields).toContain('font-mono tracking-normal normal-case');
		expect(fields).toContain('font-mono text-foreground');
	});

	test('sizes the modal by operator fields and keeps commit controls in the footer', async () => {
		const [form, panel] = await Promise.all([
			read('pages/recipes/RecipeLaunchForm.tsx'),
			read('pages/recipes/RecipeQuickLaunchPanel.tsx'),
		]);

		expect(panel).toContain("compact ? 'max-w-lg' : 'max-w-2xl'");
		expect(form).toContain("!compact && '@min-[32rem]:grid-cols-2'");
		expect(form).toContain('<DialogFooter');
		expect(form).toContain('<Button onClick={onClose} variant="secondary">');
		expect(form.indexOf('Schedule')).toBeGreaterThan(form.indexOf('const actions'));
		expect(form.indexOf('Start Session')).toBeGreaterThan(form.indexOf('const actions'));
	});

	test('both launch entries render one labelled form and the inline entry dismisses on Escape', async () => {
		const [detail, form, quick] = await Promise.all([
			read('pages/recipes/RecipeLaunchPanel.tsx'),
			read('pages/recipes/RecipeLaunchForm.tsx'),
			read('pages/recipes/RecipeQuickLaunchPanel.tsx'),
		]);

		for (const panel of [detail, quick]) expect(panel).toContain('<RecipeLaunchForm');
		expect(form).toContain('label="Launch target"');
		expect(form).toContain('Schedule');
		expect(form).toContain('Cancel');
		expect(detail).toContain("event.key !== 'Escape'");
		expect(detail).toContain('event.currentTarget.contains(event.target)');
	});
});

describe('recipe editor fields follow their content', () => {
	test('metadata, parameters, controls, and conditions stop at declared measures', async () => {
		const [metadata, parameters, editor] = await Promise.all([
			read('pages/recipes/detail/RecipeMetadataCard.tsx'),
			read('pages/recipes/detail/RecipeParametersCard.tsx'),
			read('pages/recipes/RecipeStepEditor.tsx'),
		]);

		expect(metadata).toContain('formGridMeasureClass');
		expect(parameters).toContain('formGridMeasureClass');
		expect(parameters.match(/<FieldRow/g)).toHaveLength(3);
		expect(editor).toContain('<FormGrid');
		expect(editor).toContain('minmax(0,8rem)');
		expect(editor).toContain('<fieldset className="min-w-0">');
		expect(editor).toContain('<legend className={cn(sectionCaptionClass');
		expect(editor).toContain("'mb-2 text-foreground'");
		expect(editor).toContain('<div className="flex flex-wrap gap-3">');
		expect(editor.match(/@min-\[45rem\]:w-80/g)).toHaveLength(2);
	});

	test('new-step examples stay placeholders and track the selected type', () => {
		const draft = newStepDraft();
		expect(draft.configJson).toBe('');
		expect(newStepNamePlaceholder('recipe-ref')).toBe('New recipe-ref step');
		expect(stepConfigPlaceholder('shell')).toContain('bun run smoke:qc');
		expect(stepConfigPlaceholder('skill')).toContain('skillId');
	});

	test('a config that belongs to another step type is called out', () => {
		const draft: StepDraft = {
			...newStepDraft(),
			configJson: '{"command":"bun test"}',
			stepType: 'skill',
		};
		expect(collectStepErrors(draft).configJson).toBe(
			'Config JSON does not match skill; expected a skillId key',
		);
	});

	test('create dirtiness follows values and unnamed steps own their inline error', async () => {
		const [create, editor, metadata] = await Promise.all([
			read('pages/recipes/RecipeCreatePage.tsx'),
			read('pages/recipes/RecipeStepEditor.tsx'),
			read('pages/recipes/detail/RecipeMetadataCard.tsx'),
		]);

		expect(create).toContain('id !== slugifyName(name)');
		expect(create).not.toContain('(idTouched ||');
		expect(create).toContain('Custom id; it no longer updates from Name.');
		expect(metadata).toContain('hint={idHint}');
		expect(editor).toContain('error={nameError}');
		expect(collectStepErrors(newStepDraft(), 2).name).toBe('Step name is required');
		expect(stepNameErrorForDisplay('Step name is required', false, false)).toBeNull();
		expect(stepNameErrorForDisplay('Step name is required', true, false)).toBe(
			'Step name is required',
		);
		expect(stepNameErrorForDisplay('Step name is required', false, true)).toBe(
			'Step name is required',
		);
		expect(collectStepErrors({ ...newStepDraft(), configJson: '{' }, 2).configJson).toContain(
			'Step 2 configJson',
		);
	});
});

describe('recipe detail keeps one composition across modes', () => {
	test('edit keeps overview identity and moves reload into the action bar', async () => {
		const [edit, actionBar] = await Promise.all([
			read('pages/recipes/detail/RecipeEditMode.tsx'),
			read('components/shared/EditorActionBar.tsx'),
		]);

		expect(edit).toContain("breadcrumb={{ label: 'Recipes', to: '/recipes' }}");
		expect(edit).toContain('description={isCreate ? undefined : description}');
		expect(edit).toContain('identifier={isCreate ? undefined : id}');
		expect(edit).toContain('<EditorActionBar');
		expect(edit).toContain('<RefreshCw className="h-4 w-4" />');
		expect(edit).toContain('<RecipePolicyBadges');
		expect(edit).not.toContain('actions={');
		expect(actionBar).toContain('max-sm:flex-nowrap max-sm:overflow-hidden');
	});

	test('edit expands one step and keeps saved JSON folded by default', async () => {
		const [edit, header, jsonField, step] = await Promise.all([
			read('pages/recipes/detail/RecipeEditMode.tsx'),
			read('pages/recipes/RecipeStepEditorHeader.tsx'),
			read('pages/recipes/RecipeStepJsonField.tsx'),
			read('pages/recipes/RecipeStepEditor.tsx'),
		]);

		expect(edit).toContain('const [activeStepId, setActiveStepId]');
		expect(edit).toContain('expanded={activeStepId === step.id}');
		expect(header).toContain('aria-expanded={expanded}');
		expect(step).toContain('{expanded ? (');
		expect(jsonField).toContain('useState(error !== null)');
		expect(jsonField).toContain('const open = disclosed || error !== null');
		expect(jsonField).toContain('setDisclosed(true)');
	});

	test('overview prose, step tracks, affordances, and terminal spacing are bounded', async () => {
		const [overview, parameters, step] = await Promise.all([
			read('pages/recipes/detail/RecipeOverviewMode.tsx'),
			read('pages/recipes/detail/RecipeParamsOverview.tsx'),
			read('pages/recipes/StepOverviewCard.tsx'),
		]);

		expect(overview).toContain('<RecipeBadgeTooltip content={recipeStepCountExplainer}>');
		expect(parameters).toContain('proseMeasureClass');
		expect(step).toContain('minmax(0,1fr)');
		expect(step).not.toContain('minmax(0,61rem)');
		expect(step).toContain("isLast ? 'pb-0' : 'pb-6'");
	});

	test('overview preserves recipe taxonomy, counts, policy hierarchy, and readable config', async () => {
		const [marker, overview, parameters, steps, summary] = await Promise.all([
			read('pages/recipes/RecipeStepMarker.tsx'),
			read('pages/recipes/detail/RecipeOverviewMode.tsx'),
			read('pages/recipes/detail/RecipeParamsOverview.tsx'),
			read('pages/recipes/StepOverviewCard.tsx'),
			read('pages/recipes/recipe-config-summary.ts'),
		]);

		expect(overview).toContain('<RecipeTypeBadge isPipeline={isPipeline} />');
		expect(overview).toContain('<RecipePolicyBadges recipe={recipe} />');
		expect(parameters).toContain("parameters.length === 1 ? 'parameter' : 'parameters'");
		expect(marker).toContain('w-px flex-1 bg-control-border');
		expect(steps).toContain('className="block max-w-full');
		expect(steps).toContain('identifier={');
		expect(summary).toContain("skillId: 'Skill'");
		expect(summary).toContain("executionIntent: 'Intent'");
		expect(summary).toContain('labelIsMachine: label === undefined');
	});
});

describe('directive launch states its authority and target', () => {
	test('tones execution intent and aligns it with the form column', async () => {
		// The tone travels with the intent field: the colour, the border it paints, and the sentence
		// naming what the run may do are one decision, and split across two files they drift.
		const [modal, intent] = await Promise.all([
			read('components/shared/DirectiveLaunchModal.tsx'),
			read('components/shared/DirectiveIntentField.tsx'),
		]);

		expect(intent).toContain("value === 'apply-changes' ? 'amber' : 'teal'");
		expect(intent).toContain('toneBorder[tone]');
		expect(intent).toContain('toneSurface[tone]');
		expect(intent).toContain('toneText[tone]');
		expect(intent).toContain("'rounded-xl border px-3 py-3'");
		expect(intent).not.toContain('bg-accent-muted/60 p-3');
		expect(modal).toContain('<span className={toneText.amber}>');
	});

	test('prints the resolved project path and checked-out branch', async () => {
		const modal = await read('components/shared/DirectiveLaunchModal.tsx');
		const projectHint = await read('components/shared/DirectiveProjectHint.tsx');

		expect(modal).toContain('[location.pathname, open, projectsQuery.data?.projects]');
		expect(modal).toContain('projectId={selectedProject?.id}');
		expect(projectHint).toContain('useProjectGitStatus(projectId)');
		expect(projectHint).toContain('<span className="break-all">{projectDir}</span>');
		expect(projectHint).toContain("`branch ${branch ?? 'unavailable'}`");
	});
});
