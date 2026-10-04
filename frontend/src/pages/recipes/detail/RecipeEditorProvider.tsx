import type { ReactNode } from 'react';

import { useState } from 'react';

import type { RecipeDraft } from './useRecipeDraft.ts';

import { RecipeEditorContext } from './recipeEditorContext.ts';

/**
 * Supplies a page's recipe draft to the editor parts beneath it. Rendered only while the editor is
 * open, so `submitAttempted` starts over each time it opens, as it did when the editor owned it.
 */
export function RecipeEditorProvider({
	children,
	dirty,
	draft,
	onCancel,
	onSave,
	saving,
}: {
	children: ReactNode;
	dirty: boolean;
	draft: RecipeDraft;
	onCancel: () => void;
	onSave: () => void;
	saving: boolean;
}) {
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const value = {
		actions: {
			cancel: onCancel,
			save: () => {
				setSubmitAttempted(true);
				onSave();
			},
			setDescription: draft.setDescription,
			setName: draft.setName,
			setParameters: draft.setParameters,
			setSteps: draft.setSteps,
			updateStep: draft.updateStep,
		},
		meta: { dirty, saving, submitAttempted },
		state: {
			description: draft.description,
			hasStepErrors: draft.hasStepErrors,
			name: draft.name,
			parameters: draft.parameters,
			stepErrors: draft.stepErrors,
			steps: draft.steps,
		},
	};
	return <RecipeEditorContext value={value}>{children}</RecipeEditorContext>;
}
