import type { ReactNode } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { useState } from 'react';

import { EditorActionBar } from '../../../components/shared/EditorActionBar.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { recipeStepCountExplainer } from '../recipe-badge-explainers.ts';
import { moveStep, newStepDraft, policyStepsFromDrafts } from '../recipe-steps.ts';
import { RecipeBadgeTooltip } from '../RecipeBadgeTooltip.tsx';
import { RecipePolicyBadges } from '../RecipeMetadataBadges.tsx';
import { RecipeStepEditor } from '../RecipeStepEditor.tsx';
import { useRecipeEditor } from './recipeEditorContext.ts';
import { RecipeParametersCard } from './RecipeParametersCard.tsx';

/*
 * The parts both recipe editors are built from. `CreateRecipeEditor` and `EditRecipeEditor` compose
 * them inside their own page rail and say what differs — the header, the save labels, the id field,
 * Reload — so nothing here has to work out which editor it is in.
 */

/**
 * The commit control. `blockReason` is every condition under which Save bails with a toast: the
 * control was refusing work it looked perfectly willing to do, and the only hint was a `title` on
 * the button, which is unreachable from the keyboard and unannounced by a screen reader.
 */
export function RecipeEditorActionBar({
	blockReason,
	children,
	pendingLabel,
	saveLabel,
}: {
	blockReason: null | string;
	children?: ReactNode;
	pendingLabel: string;
	saveLabel: string;
}) {
	const { actions, meta } = useRecipeEditor();
	return (
		// "Cancel", not "Discard": in edit mode this is also the way back to the overview, which is why
		// it stays live on a clean form. Settings' Discard reverts in place and has somewhere to sit
		// idle; this one does not. It does revert — `RecipeDetailPage` re-seeds the draft from the
		// loaded recipe before it changes mode — so the word covers both halves of what it does.
		<EditorActionBar
			blockReason={blockReason}
			dirty={meta.dirty}
			discardEnabledWhenClean
			discardLabel="Cancel"
			onDiscard={actions.cancel}
			onSave={actions.save}
			pending={meta.saving}
			pendingLabel={pendingLabel}
			saveLabel={saveLabel}>
			{children}
		</EditorActionBar>
	);
}

export function RecipeEditorParameters() {
	const { actions, state } = useRecipeEditor();
	return (
		<RecipeParametersCard parameters={state.parameters} setParameters={actions.setParameters} />
	);
}

export function RecipeEditorSteps() {
	const { actions, meta, state } = useRecipeEditor();
	const { setSteps, updateStep } = actions;
	const { stepErrors, steps } = state;
	const [activeStepId, setActiveStepId] = useState<null | string>(() => steps[0]?.id ?? null);

	function addStep(): void {
		const step = newStepDraft();
		setSteps((current) => [...current, step]);
		setActiveStepId(step.id);
	}

	return (
		<Card className="flex flex-col gap-4">
			{/* The policy summary, off the live draft rather than off a saved recipe. View mode stated
			    it and edit mode stated nothing, so the summary of the policy you are editing
			    disappeared at the moment you started editing it. `policyStepsFromDrafts` reads only
			    the first-class draft fields — failure behaviour, retry count, execution intent — so it
			    costs no JSON parse and cannot throw on a half-typed brace, and the chips move as the
			    selects do. */}
			<CardHeader
				action={
					<Button onClick={addStep}>
						<Plus className="h-4 w-4" />
						Add Step
					</Button>
				}
				badge={
					<>
						<RecipeBadgeTooltip content={recipeStepCountExplainer}>
							{steps.length} step{steps.length !== 1 ? 's' : ''}
						</RecipeBadgeTooltip>
						<RecipePolicyBadges recipe={{ steps: policyStepsFromDrafts(steps) }} />
					</>
				}
				className="mb-0"
				title="Steps"
			/>
			{/* No `space-y-4`: each step carries its own bottom padding inside the spine's column, so
			    the spine runs from one marker to the next instead of being cut by a margin between
			    siblings. */}
			<div>
				{steps.map((step, index) => {
					const errors = stepErrors.find((entry) => entry.id === step.id) ?? {
						configJson: null,
						executionIntent: null,
						id: step.id,
						name: null,
						postHookJson: null,
						preHookJson: null,
						when: null,
					};
					return (
						<RecipeStepEditor
							errors={errors}
							expanded={activeStepId === step.id}
							index={index}
							key={step.id}
							onChange={(patch) => updateStep(step.id, patch)}
							onDelete={() => {
								const nextActive =
									steps[index + 1]?.id ?? steps[index - 1]?.id ?? null;
								setSteps((current) =>
									current.filter((entry) => entry.id !== step.id),
								);
								setActiveStepId((current) =>
									current === step.id ? nextActive : current,
								);
							}}
							onMoveDown={() =>
								setSteps((current) => moveStep(current, index, index + 1))
							}
							onMoveUp={() =>
								setSteps((current) => moveStep(current, index, index - 1))
							}
							onToggle={() =>
								setActiveStepId((current) => (current === step.id ? null : step.id))
							}
							showAllErrors={meta.submitAttempted}
							step={step}
							total={steps.length}
						/>
					);
				})}
			</div>
		</Card>
	);
}
