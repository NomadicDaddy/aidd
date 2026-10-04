import type { ReactNode } from 'react';

import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { PageRail } from '../../../components/shared/PageRail.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { pageRailByContentType } from '../../../lib/contentRails.ts';
import { policyStepsFromDrafts } from '../recipe-steps.ts';
import { RecipePolicyBadges } from '../RecipeMetadataBadges.tsx';
import {
	RecipeEditorActionBar,
	RecipeEditorParameters,
	RecipeEditorSteps,
} from './RecipeEditMode.tsx';
import { useRecipeEditor } from './recipeEditorContext.ts';
import { RecipeDescriptionField, RecipeMetadataCard } from './RecipeMetadataCard.tsx';
import { draftNameBlocker, draftStepsBlocker } from './useRecipeDraft.ts';

const PAGE_RAIL = pageRailByContentType.workflow;

/**
 * The editor for a saved recipe. It keeps the overview's identity in the header, so opening the
 * editor does not look like leaving the recipe, and carries Reload in the action bar.
 *
 * `nameField` is the one part that differs between a custom recipe and a system one, whose name is
 * reserved: the page passes `RecipeNameField` or `LockedRecipeNameField`.
 */
export function EditRecipeEditor({
	id,
	nameField,
	onReload,
}: {
	id: string;
	nameField: ReactNode;
	onReload: () => void;
}) {
	const { state } = useRecipeEditor();
	// A system recipe's name is reserved and never empty, so the name check never fires for one.
	const blockReason = draftNameBlocker(state.name) ?? draftStepsBlocker(state);

	return (
		// `page-reveal` staggers the rail's direct children, so the header, the action bar and the
		// cards sit straight inside it. `@container` on the same element: the cards measure the
		// content column, and a card cannot query containment it declares on itself.
		<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				breadcrumb={{ label: 'Recipes', to: '/recipes' }}
				description={state.description}
				helpSlug="recipes"
				identifier={id}
				title={state.name || id}
			/>
			<RecipeEditorActionBar
				blockReason={blockReason}
				pendingLabel="Saving…"
				saveLabel="Save">
				<span className="truncate font-medium text-foreground">{state.name || id}</span>
				<RecipePolicyBadges recipe={{ steps: policyStepsFromDrafts(state.steps) }} />
				<Button onClick={onReload} size="compact" variant="ghost">
					<RefreshCw className="h-4 w-4" />
					Reload
				</Button>
			</RecipeEditorActionBar>
			<RecipeMetadataCard columns={2}>
				{nameField}
				<RecipeDescriptionField />
			</RecipeMetadataCard>
			<RecipeEditorParameters />
			<RecipeEditorSteps />
		</PageRail>
	);
}
