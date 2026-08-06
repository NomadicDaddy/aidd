import { Link } from 'react-router';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';

export function RecipeNotFound() {
	return (
		// The recipeDetail route's not-found state is still that route, so it opens the same way
		// every other route does. It used to be a bare back-link above a Card with its own `h1`,
		// which put the page title in a different place and at a different size depending on
		// whether the recipe existed.
		<div className="space-y-5">
			<PageHeader
				breadcrumb={
					<Link className="hover:text-foreground" to="/recipes">
						Recipes
					</Link>
				}
				description="The recipe may have been removed, or the link may be incorrect."
				title="Recipe not found"
			/>
			{/* Same absence block, same secondary action, as the app-level 404. */}
			<EmptyState
				action={
					<Link className={buttonClassName('secondary')} to="/recipes">
						Back to Recipes
					</Link>
				}>
				No recipe matches this URL.
			</EmptyState>
		</div>
	);
}
