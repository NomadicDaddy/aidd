import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { Link } from 'react-router';

import { buttonClassName } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';

export function RecipeNotFound() {
	return (
		<div className="space-y-5">
			<Link
				className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
				to="/recipes">
				<ArrowLeft className="h-4 w-4" />
				Recipes
			</Link>
			<Card>
				<h1 className="text-xl font-semibold text-foreground">Recipe not found</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					No recipe matches this URL. The recipe may have been removed or the link may be
					incorrect.
				</p>
				<div className="mt-4">
					<Link className={buttonClassName()} to="/recipes">
						Back to Recipes
					</Link>
				</div>
			</Card>
		</div>
	);
}
