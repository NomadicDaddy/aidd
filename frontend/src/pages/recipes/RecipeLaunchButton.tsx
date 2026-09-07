import { default as Send } from 'lucide-react/dist/esm/icons/send';

import type { RecipeDefinition } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { launchHint } from './recipe-launch.ts';

export interface RecipeLaunchProps {
	activeRecipeId?: null | string;
	launchDisabled: boolean;
	launchHintId?: string;
	launchPanelId?: string;
	launchPending: boolean;
	onLaunch: (recipe: RecipeDefinition, trigger: HTMLButtonElement) => void;
}

export function RecipeLaunchButton({
	activeRecipeId,
	launchDisabled,
	launchHintId,
	launchPanelId,
	launchPending,
	onLaunch,
	recipe,
	size = 'default',
}: { recipe: RecipeDefinition; size?: 'compact' | 'default' } & RecipeLaunchProps) {
	return (
		<Button
			aria-controls={launchPanelId}
			aria-describedby={launchDisabled ? launchHintId : undefined}
			aria-expanded={launchPanelId ? activeRecipeId === recipe.id : undefined}
			aria-label={`Launch ${recipe.name}`}
			disabled={launchDisabled || launchPending}
			onClick={(event) => onLaunch(recipe, event.currentTarget)}
			size={size}
			title={launchDisabled ? launchHint : undefined}
			variant="primary">
			<Send className="h-4 w-4" />
			Launch
		</Button>
	);
}
