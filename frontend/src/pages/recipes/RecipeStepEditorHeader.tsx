import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { StepDraft } from './recipe-steps.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { dangerRowActionClass } from '../../lib/tones.ts';

export function RecipeStepEditorHeader({
	expanded,
	index,
	onDelete,
	onMoveDown,
	onMoveUp,
	onToggle,
	step,
	total,
}: {
	expanded: boolean;
	index: number;
	onDelete: () => void;
	onMoveDown: () => void;
	onMoveUp: () => void;
	onToggle: () => void;
	step: StepDraft;
	total: number;
}) {
	return (
		<div className="flex items-center gap-1">
			<Button
				aria-expanded={expanded}
				className="mr-auto max-w-full flex-1 justify-start overflow-hidden"
				onClick={onToggle}
				variant="ghost">
				<DisclosureMarker open={expanded} />
				<span className="truncate">{step.name.trim() || `Step ${index + 1}`}</span>
				<span className="shrink-0 text-xs text-muted-foreground">{step.stepType}</span>
			</Button>
			{total > 1 ? (
				<>
					<IconButton
						ariaLabel={`Move step ${index + 1} up`}
						disabled={index === 0}
						onClick={onMoveUp}
						variant="ghost">
						<ArrowUp className="h-4 w-4" />
					</IconButton>
					<IconButton
						ariaLabel={`Move step ${index + 1} down`}
						disabled={index === total - 1}
						onClick={onMoveDown}
						variant="ghost">
						<ArrowDown className="h-4 w-4" />
					</IconButton>
				</>
			) : null}
			<IconButton
				ariaLabel={`Delete step ${index + 1}`}
				className={dangerRowActionClass}
				onClick={onDelete}
				variant="ghost">
				<Trash2 className="h-4 w-4" />
			</IconButton>
		</div>
	);
}
