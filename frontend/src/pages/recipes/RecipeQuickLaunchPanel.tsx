import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { useEffect, useId, useRef } from 'react';

import type { RecipeDefinition } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { autoParameters } from './recipe-parameters.ts';

export function RecipeQuickLaunchPanel({
	launchDisabled,
	launchPending,
	onClose,
	onLaunch,
	parameters,
	recipe,
	setParameters,
}: {
	launchDisabled: boolean;
	launchPending: boolean;
	onClose: () => void;
	onLaunch: () => void;
	parameters: Record<string, string>;
	recipe: RecipeDefinition;
	setParameters: (update: (current: Record<string, string>) => Record<string, string>) => void;
}) {
	const headingId = useId();
	const panelRef = useRef<HTMLDivElement>(null);

	// The panel mounts above the list, and the Launch button that opened it can be several screens
	// below it: on a phone the recipe grid is one column, so tapping Launch on the twelfth recipe
	// otherwise produces no visible change at all. Same rule the Runs console uses — scroll only
	// when the panel's top edge is off-screen, so opening it from the top of the list stays put.
	useEffect(() => {
		const node = panelRef.current;
		if (!node) return;
		const rect = node.getBoundingClientRect();
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		if (rect.top < 0 || rect.top > viewportHeight)
			node.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [recipe.id]);

	return (
		<div ref={panelRef}>
			<Card aria-labelledby={headingId} className="space-y-4">
				{/* CardHeader rather than a hand-rolled row: its own header is `items-start`, so the
				    ghost Close button sizes to its label at every width. The gated `sm:items-start`
				    this replaced left the button inheriting `align-items: stretch` below 640px,
				    where it measured 324x36 — a full-width bar for the dismissive action, against
				    138x36 for the Start Session it sits above. */}
				<CardHeader
					action={
						<Button onClick={onClose} variant="ghost">
							Close
						</Button>
					}
					className="mb-0"
					description={`${recipe.steps.length} ordered step${
						recipe.steps.length === 1 ? '' : 's'
					} will run in the selected project.`}
					id={headingId}
					title={`Launch ${recipe.name}`}
				/>
				<div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
					{recipe.parameters
						.filter((parameter) => !autoParameters.has(parameter.name))
						.map((parameter) => (
							<FieldRow key={parameter.name} label={parameter.name}>
								<Input
									onChange={(event) =>
										setParameters((current) => ({
											...current,
											[parameter.name]: event.target.value,
										}))
									}
									placeholder={parameter.description ?? parameter.name}
									value={parameters[parameter.name] ?? ''}
								/>
							</FieldRow>
						))}
					{recipe.parameters.every((parameter) => autoParameters.has(parameter.name)) && (
						<div className="text-sm text-muted-foreground">
							Project parameters are filled from the selected launch target.
						</div>
					)}
				</div>
				<Button
					disabled={launchPending || launchDisabled}
					onClick={onLaunch}
					variant="primary">
					<Send className="h-4 w-4" />
					Start Session
				</Button>
			</Card>
		</div>
	);
}
