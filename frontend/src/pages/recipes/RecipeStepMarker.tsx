/**
 * The numbered node and the spine beneath it: the device that makes a list of step cards read as a
 * pipeline rather than as a stack.
 *
 * Shared rather than owned by the overview card, because the one place the ordering device mattered
 * most was the place that did not have it. View mode drew this; edit mode — where the operator is
 * actually reordering the steps — replaced it with a flat `Step 1` badge and no spine at all, so a
 * pipeline stopped looking like a pipeline at exactly the moment its order was being changed.
 *
 * `ring-card` is the card background the marker sits on in both modes: in edit mode the marker is
 * outside the sunken step card, on the Steps card, so the ring colour is the same one.
 */
export function RecipeStepMarker({ isLast, stepNumber }: { isLast: boolean; stepNumber: number }) {
	return (
		<div className="hidden flex-col items-center sm:flex">
			<div className="flex h-7 w-7 items-center justify-center rounded-full border border-control-border bg-muted text-xs font-bold text-foreground ring-2 ring-card">
				{stepNumber}
			</div>
			{!isLast && <div className="w-px flex-1 bg-control-border" />}
		</div>
	);
}
