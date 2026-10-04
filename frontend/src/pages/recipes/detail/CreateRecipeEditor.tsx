import type { ReactNode } from 'react';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { PageRail } from '../../../components/shared/PageRail.tsx';
import { pageRailByContentType } from '../../../lib/contentRails.ts';
import {
	RecipeEditorActionBar,
	RecipeEditorParameters,
	RecipeEditorSteps,
} from './RecipeEditMode.tsx';
import { useRecipeEditor } from './recipeEditorContext.ts';
import {
	RecipeDescriptionField,
	RecipeIdField,
	RecipeMetadataCard,
	RecipeNameField,
} from './RecipeMetadataCard.tsx';
import { draftNameBlocker, draftStepsBlocker } from './useRecipeDraft.ts';

const PAGE_RAIL = pageRailByContentType.workflow;

/**
 * The editor for a recipe that does not exist yet: it has no identity to show in the header and
 * nothing to reload, and it is the only editor that names the recipe's id.
 */
export function CreateRecipeEditor({
	id,
	idError,
	idHint,
	onIdChange,
}: {
	id: string;
	idError: null | string;
	idHint: ReactNode;
	onIdChange: (value: string) => void;
}) {
	const { state } = useRecipeEditor();
	const blockReason =
		draftNameBlocker(state.name) ??
		(id.trim() ? null : 'Recipe id is required') ??
		idError ??
		draftStepsBlocker(state);

	return (
		// `page-reveal` staggers the rail's direct children, so the header, the action bar and the
		// cards sit straight inside it. `@container` on the same element: the cards measure the
		// content column, and a card cannot query containment it declares on itself.
		<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				breadcrumb={{ label: 'Recipes', to: '/recipes' }}
				helpSlug="recipes"
				title="New Recipe"
			/>
			<RecipeEditorActionBar
				blockReason={blockReason}
				pendingLabel="Creating…"
				saveLabel="Create"
			/>
			<RecipeMetadataCard columns={3}>
				<RecipeIdField error={idError} hint={idHint} onChange={onIdChange} value={id} />
				<RecipeNameField />
				<RecipeDescriptionField />
			</RecipeMetadataCard>
			<RecipeEditorParameters />
			<RecipeEditorSteps />
		</PageRail>
	);
}
