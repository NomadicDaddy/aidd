import { buildSuggestionPrompt } from 'aidd-shared/contracts/director';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { DirectorSuggestionRecord } from '../../api/types.ts';

import { IconButton } from '../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../components/ui/dialog.tsx';

// Suggestion args are persisted as a JSON object string (the recipe's targeting
// parameters). Render them as readable `name: value` lines rather than raw JSON so
// the launch preview matches the prompt preview shown for run-backed suggestions.
function formatRecipeArgs(suggestedArgs: null | string): string {
	if (!suggestedArgs) return 'No additional recipe parameters.';
	try {
		const parsed: unknown = JSON.parse(suggestedArgs);
		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			const lines = Object.entries(parsed as Record<string, unknown>).map(
				([key, value]) => `${key}: ${String(value)}`,
			);
			return lines.length > 0 ? lines.join('\n') : 'No additional recipe parameters.';
		}
	} catch {
		// Not valid JSON — fall back to showing the raw stored value.
	}
	return suggestedArgs;
}

/**
 * Exactly what Launch will send, before it sends it.
 *
 * Lives beside the queue rather than inside `DirectorSuggestions.tsx` because it shares nothing with
 * them but the record type: the queue is a list, this is a modal over one item, and keeping both in
 * one module put the file over the per-file line cap the moment the rows changed shape.
 */
export function SuggestionLaunchPreviewDialog({
	onClose,
	suggestion,
}: {
	onClose: () => void;
	suggestion: DirectorSuggestionRecord;
}) {
	const launchesRecipe = suggestion.suggestedRecipe !== null;
	return (
		<Dialog aria-labelledby="suggestion-launch-preview-title" onClose={onClose} open>
			<DialogPanel className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2
							className="text-lg font-semibold text-foreground"
							id="suggestion-launch-preview-title">
							Launch preview
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Launch starts {launchesRecipe ? 'a recipe pipeline' : 'a coding run'} in{' '}
							<span className="font-medium text-foreground">
								{suggestion.projectId}
							</span>{' '}
							{launchesRecipe
								? `using ${suggestion.suggestedRecipe}:`
								: 'with this prompt:'}
						</p>
					</div>
					<IconButton ariaLabel="Close launch preview" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<pre className="mt-4 rounded-md bg-muted p-3 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
					{launchesRecipe
						? formatRecipeArgs(suggestion.suggestedArgs)
						: buildSuggestionPrompt(suggestion)}
				</pre>
			</DialogPanel>
		</Dialog>
	);
}
