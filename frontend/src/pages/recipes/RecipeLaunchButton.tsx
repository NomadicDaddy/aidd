import { default as Send } from 'lucide-react/dist/esm/icons/send';

import type { RecipeDefinition } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { launchHint } from './recipe-launch.ts';

export interface RecipeLaunchProps {
	launchDisabled: boolean;
	launchHintId?: string;
	launchPending: boolean;
	onLaunch: (recipe: RecipeDefinition) => void;
}

export function RecipeLaunchButton({
	launchDisabled,
	launchHintId,
	launchPending,
	onLaunch,
	recipe,
	size = 'default',
}: { recipe: RecipeDefinition; size?: 'compact' | 'default' } & RecipeLaunchProps) {
	return (
		<Button
			aria-describedby={launchDisabled ? launchHintId : undefined}
			disabled={launchDisabled || launchPending}
			onClick={() => onLaunch(recipe)}
			size={size}
			title={launchDisabled ? launchHint : undefined}
			variant="primary">
			<Send className="h-4 w-4" />
			Launch
		</Button>
	);
}
