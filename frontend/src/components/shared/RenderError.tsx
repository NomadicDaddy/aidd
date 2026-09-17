import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

/** Loaded only after a render failure, keeping the card primitives off the shell's critical path. */
export function RenderError({ error }: { error: Error }) {
	return (
		<div className="p-6">
			<Card className="mx-auto max-w-lg" variant="panel">
				<h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					This page hit an unexpected error and could not be displayed. The rest of the
					app is still usable — try another page from the sidebar, or reload.
				</p>
				<pre
					className={cn(
						'mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs',
						toneText.red,
					)}>
					{error.message}
				</pre>
				<div className="mt-4">
					<Button onClick={() => window.location.reload()} variant="primary">
						Reload page
					</Button>
				</div>
			</Card>
		</div>
	);
}
