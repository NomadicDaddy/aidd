import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';

/** Settings before its config has arrived. */
export function SettingsLoadingCard() {
	return (
		<Card className="py-10 text-center text-sm text-muted-foreground">Loading settings…</Card>
	);
}

/**
 * Settings when its config could not be read.
 *
 * The page replaces itself with this rather than rendering an empty form: every field on Settings
 * is seeded from the config, so a form drawn without one offers to save blanks over a file the page
 * never managed to read.
 */
export function SettingsErrorCard({ error, onRetry }: { error: unknown; onRetry: () => void }) {
	return (
		<Card className={`text-sm ${toneBorder.red} ${toneSurface.red} ${toneText.red}`}>
			<div className="flex items-center justify-between gap-3">
				<span>{error instanceof Error ? error.message : 'Could not load settings.'}</span>
				<Button onClick={onRetry} variant="secondary">
					<RefreshCw className="h-4 w-4" />
					Retry
				</Button>
			</div>
		</Card>
	);
}
