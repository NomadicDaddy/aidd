import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useState } from 'react';

import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { EditorActionBar } from '../../../components/shared/EditorActionBar.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { PageRail } from '../../../components/shared/PageRail.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { pageRailByContentType } from '../../../lib/contentRails.ts';
import { recipeStepCountExplainer } from '../recipe-badge-explainers.ts';
import {
	moveStep,
	newStepDraft,
	policyStepsFromDrafts,
	type StepDraft,
	type StepJsonErrors,
} from '../recipe-steps.ts';
import { RecipeBadgeTooltip } from '../RecipeBadgeTooltip.tsx';
import { RecipePolicyBadges } from '../RecipeMetadataBadges.tsx';
import { RecipeStepEditor } from '../RecipeStepEditor.tsx';
import { RecipeMetadataCard } from './RecipeMetadataCard.tsx';
import { RecipeParametersCard } from './RecipeParametersCard.tsx';

interface StepErrorEntry extends StepJsonErrors {
	id: string;
}

const PAGE_RAIL = pageRailByContentType.workflow;

/**
 * Every condition under which `onSave` bails with a toast, in the order the pages check them.
 *
 * The commit control was refusing work it looked perfectly willing to do — a 3572px page whose only
 * hint was a `title` on the button, which is unreachable from the keyboard and unannounced by a
 * screen reader. Stating the reason beside the control costs nothing and answers it in place.
 */
function saveBlocker({
	hasStepErrors,
	id,
	idError,
	isCreate,
	name,
	nameReadOnly,
	steps,
}: {
	hasStepErrors: boolean;
	id: string;
	idError: null | string | undefined;
	isCreate: boolean;
	name: string;
	nameReadOnly: boolean;
	steps: StepDraft[];
}): null | string {
	// `nameReadOnly` is a system recipe, whose name is fixed and never empty.
	if (!nameReadOnly && !name.trim()) return 'Recipe name is required';
	if (isCreate && !id.trim()) return 'Recipe id is required';
	if (idError) return idError;
	if (steps.length === 0) return 'Add at least one step';
	if (hasStepErrors) return 'Fix recipe step errors before saving';
	return null;
}

interface Props {
	description: string;
	dirty: boolean;
	hasStepErrors: boolean;
	id: string;
	idError?: null | string;
	idHint?: ReactNode;
	name: string;
	nameReadOnly?: boolean;
	onCancel: () => void;
	onReload?: () => void;
	onSave: () => void;
	parameters: RecipeParameterDefinition[];
	saving?: boolean;
	setDescription: Dispatch<SetStateAction<string>>;
	setId?: (value: string) => void;
	setName: (value: string) => void;
	setParameters: Dispatch<SetStateAction<RecipeParameterDefinition[]>>;
	setSteps: Dispatch<SetStateAction<StepDraft[]>>;
	stepErrors: StepErrorEntry[];
	steps: StepDraft[];
	updateStep: (stepId: string, patch: Partial<StepDraft>) => void;
}

export function RecipeEditMode({
	description,
	dirty,
	hasStepErrors,
	id,
	idError,
	idHint,
	name,
	nameReadOnly = false,
	onCancel,
	onReload,
	onSave,
	parameters,
	saving = false,
	setDescription,
	setId,
	setName,
	setParameters,
	setSteps,
	stepErrors,
	steps,
	updateStep,
}: Props) {
	const isCreate = setId !== undefined;
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const [activeStepId, setActiveStepId] = useState<null | string>(() => steps[0]?.id ?? null);
	const saveBlockedBy = saveBlocker({
		hasStepErrors,
		id,
		idError,
		isCreate,
		name,
		nameReadOnly,
		steps,
	});

	function attemptSave(): void {
		setSubmitAttempted(true);
		onSave();
	}

	function addStep(): void {
		const step = newStepDraft();
		setSteps((current) => [...current, step]);
		setActiveStepId(step.id);
	}

	return (
		// `page-reveal` belongs here rather than on the wrapper each caller supplied: the animation
		// staggers a container's *direct children*, and both callers wrapped this component in a
		// single div, so the whole form was one child and faded in as a single block. Here the header,
		// the action bar, and the three cards are the children the stagger was written for.
		//
		// `@container` on the same element, the way Runs, Settings and Director declare theirs: the
		// cards below measure the content column rather than the viewport, and a card cannot query
		// containment it declares on itself.
		<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				breadcrumb={{ label: 'Recipes', to: '/recipes' }}
				description={isCreate ? undefined : description}
				helpSlug="recipes"
				identifier={isCreate ? undefined : id}
				title={isCreate ? 'New Recipe' : name || id}
			/>

			{/* "Cancel", not "Discard": in edit mode this is also the way back to the overview, which
			    is why it stays live on a clean form. Settings' Discard reverts in place and has
			    somewhere to sit idle; this one does not. It does revert — `RecipeDetailPage`
			    re-seeds the form from the loaded recipe before it changes mode — so the word covers
			    both halves of what it does rather than only the visible one. */}
			<EditorActionBar
				blockReason={saveBlockedBy}
				dirty={dirty}
				discardEnabledWhenClean
				discardLabel="Cancel"
				onDiscard={onCancel}
				onSave={attemptSave}
				pending={saving}
				pendingLabel={isCreate ? 'Creating…' : 'Saving…'}
				saveLabel={isCreate ? 'Create' : 'Save'}>
				{!isCreate ? (
					<>
						<span className="truncate font-medium text-foreground">{name || id}</span>
						<RecipePolicyBadges recipe={{ steps: policyStepsFromDrafts(steps) }} />
					</>
				) : null}
				{onReload ? (
					<Button onClick={onReload} size="compact" variant="ghost">
						<RefreshCw className="h-4 w-4" />
						Reload
					</Button>
				) : null}
			</EditorActionBar>

			<RecipeMetadataCard
				description={description}
				id={id}
				idError={idError}
				idHint={idHint}
				name={name}
				nameReadOnly={nameReadOnly}
				setDescription={setDescription}
				setId={setId}
				setName={setName}
			/>

			<RecipeParametersCard parameters={parameters} setParameters={setParameters} />

			<Card className="flex flex-col gap-4">
				{/* The policy summary, off the live draft rather than off a saved recipe. View mode
				    stated it and edit mode stated nothing, so the summary of the policy you are
				    editing disappeared at the moment you started editing it. `policyStepsFromDrafts`
				    reads only the first-class draft fields — failure behaviour, retry count,
				    execution intent — so it costs no JSON parse and cannot throw on a half-typed
				    brace, and the chips move as the selects do. */}
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
				{/* No `space-y-4`: each step carries its own bottom padding inside the spine's
				    column, so the spine runs from one marker to the next instead of being cut by a
				    margin between siblings. */}
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
									setActiveStepId((current) =>
										current === step.id ? null : step.id,
									)
								}
								showAllErrors={submitAttempted}
								step={step}
								total={steps.length}
							/>
						);
					})}
				</div>
			</Card>
		</PageRail>
	);
}
