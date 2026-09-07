import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { PageRail } from '../../../components/shared/PageRail.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';
import { pageRailByContentType } from '../../../lib/contentRails.ts';
import { proseMeasureCardClass } from '../../../lib/typography.ts';

const PAGE_RAIL = pageRailByContentType.reading;

export function RecipeNotFound() {
	return (
		// The recipeDetail route's not-found state is still that route, so it opens the same way
		// every other route does. A bare back-link above a Card with its own `h1` would put the
		// page title in a different place and at a different size depending on whether the
		// recipe existed. `page-reveal` is the other half of "opens the same way": without it
		// this would be the one route in the app that appears without the entrance.
		//
		// The marker is the app-level one on purpose, not a recipe-specific value. It is what
		// `scripts/lib/crawltest/page-assertions/core.ts` reads to classify a page as a 404, and
		// `visit.ts` fails any crawled route that carries it. That is the behaviour we want here:
		// `recipeDetail` is crawled only by following links off /recipes, so this state can only be
		// reached during a crawl by a link pointing at a recipe that does not exist — a broken link,
		// which would score as a healthy page if this soft 404 went unmarked.
		<PageRail
			className="page-reveal space-y-5"
			data-aidd-page={NOT_FOUND_PAGE_MARKER}
			rail={PAGE_RAIL}>
			<PageHeader
				breadcrumb={{ label: 'Recipes', to: '/recipes' }}
				description="The recipe may have been removed, or the link may be incorrect."
				title="Recipe not found"
			/>
			{/* Same absence block, same secondary action, and the same reading measure, as the
			    app-level 404. The cap is part of "same": a dashed border marks an absence, and
			    uncapped at 2250x1309 it drew a ~1960px frame around one short sentence, so the
			    emphasis landed on the box rather than on the message. */}
			<EmptyState
				action={
					<Link className={buttonClassName('secondary')} to="/recipes">
						Back to Recipes
					</Link>
				}
				className={proseMeasureCardClass}>
				No recipe matches this URL.
			</EmptyState>
		</PageRail>
	);
}
