import { createContext, use } from 'react';

import type { RecipeDraft } from './useRecipeDraft.ts';

/**
 * What every part of the recipe editor reads. The editor used to take all of this as 21 props and
 * work out which of three editors it was from which optional ones had been passed; the parts now
 * read the draft here, and the variant that composes them says which editor it is.
 */
export interface RecipeEditorValue {
	actions: Pick<
		RecipeDraft,
		'setDescription' | 'setName' | 'setParameters' | 'setSteps' | 'updateStep'
	> & {
		cancel: () => void;
		/** Save, and from then on show every step error rather than only the touched ones. */
		save: () => void;
	};
	meta: {
		dirty: boolean;
		saving: boolean;
		submitAttempted: boolean;
	};
	state: Pick<
		RecipeDraft,
		'description' | 'hasStepErrors' | 'name' | 'parameters' | 'stepErrors' | 'steps'
	>;
}

export const RecipeEditorContext = createContext<null | RecipeEditorValue>(null);

/** The recipe draft supplied by RecipeEditorProvider. */
export function useRecipeEditor(): RecipeEditorValue {
	const value = use(RecipeEditorContext);
	if (value === null)
		throw new Error('Recipe editor parts must render inside RecipeEditorProvider.');
	return value;
}
