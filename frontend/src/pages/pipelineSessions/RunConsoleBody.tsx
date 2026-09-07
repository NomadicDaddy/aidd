import { useState } from 'react';

import type { RunLiveOutput } from '../../hooks/useRunLiveOutput.ts';

import { Button } from '../../components/ui/button.tsx';
import { formatBytes } from '../../lib/formatters.ts';
import { describeOutputSlice, formatOutputSlice } from '../../lib/outputSlice.ts';
import { monoEditorMeasureClass } from '../../lib/typography.ts';
import { MAX_PRETTY_ENTRIES, parseConsoleEntries } from '../runs/consoleEntries.ts';
import { LiveConsolePretty } from '../runs/LiveConsolePretty.tsx';
import { LogPre } from './LogPre.tsx';

/**
 * The expanded transcript for one step: the Events/Raw selector and whichever view it names.
 *
 * Purely a projection of the `RunLiveOutput` its owner already holds — it subscribes to nothing
 * and reports nothing upward, so the disclosure above it stays the only authority on what this
 * step's run is doing.
 */
export function RunConsoleBody({
	backend,
	output,
}: {
	backend: null | string | undefined;
	output: RunLiveOutput;
}) {
	const [view, setView] = useState<'pretty' | 'raw'>('pretty');
	const text = output.text;
	const hasContent = text.length > 0;
	const slice = describeOutputSlice(text, output.totalBytes ?? 0);
	const sliceMeta = output.truncated ? formatOutputSlice(slice, 'most recent') : null;
	const display = hasContent
		? text
		: output.isLoading
			? 'Loading run output…'
			: 'No run output available.';
	const parsedEntries = hasContent ? parseConsoleEntries(text, backend) : [];
	const entries =
		parsedEntries.length > MAX_PRETTY_ENTRIES
			? parsedEntries.slice(parsedEntries.length - MAX_PRETTY_ENTRIES)
			: parsedEntries;

	return (
		<div className={`mt-2 min-w-0 ${monoEditorMeasureClass}`}>
			<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
				<span className="sr-only">Run console view</span>
				<div className="flex items-center gap-1">
					<Button
						aria-pressed={view === 'pretty'}
						onClick={() => setView('pretty')}
						size="compact"
						variant={view === 'pretty' ? 'secondary' : 'ghost'}>
						Events
					</Button>
					<Button
						aria-pressed={view === 'raw'}
						onClick={() => setView('raw')}
						size="compact"
						variant={view === 'raw' ? 'secondary' : 'ghost'}>
						Raw
					</Button>
				</div>
				{sliceMeta ? (
					<span className="text-xs text-muted-foreground">{sliceMeta}</span>
				) : null}
			</div>
			{view === 'pretty' ? (
				<div
					aria-label="Run console events"
					className="max-h-[calc(100dvh-16rem)] overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-foreground"
					role="region"
					tabIndex={0}>
					{hasContent ? (
						<LiveConsolePretty entries={entries} find="" />
					) : (
						<p className="text-muted-foreground">{display}</p>
					)}
				</div>
			) : (
				// `expandable` here and not on `StepOutput`: that one truncates its own content and
				// owns a toggle already. Raw is preserved for diagnosis without making transport
				// encoding the report's primary reading experience.
				<LogPre
					caption="Raw run console output"
					expandable
					expandLabel={output.truncated ? 'Expand loaded output' : 'Show full output'}
					expansionHint={
						hasContent
							? `Expands ${formatBytes(slice.shownBytes)} inline on this page.`
							: 'Expands the loaded output inline on this page.'
					}
					startAtEnd={hasContent}>
					{display}
				</LogPre>
			)}
		</div>
	);
}
