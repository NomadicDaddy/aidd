import type { ReactNode } from 'react';

import type { ConsoleEntry, ToolConsoleEntry } from './consoleEntries.ts';

import { cn } from '../../lib/cn.ts';
import { toneBadge, toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { highlightLine } from './liveConsoleText.tsx';

function text(value: string, find: string): ReactNode {
	return find ? highlightLine(value, find) : value;
}

// This view used to invent four pixel sizes and render all of them at once: measured in the open
// transcript at 2250, 62 spans at 10px, 61 summaries and 61 pre blocks at 11px, 65 code spans at
// 12px and 20 paragraphs at 13px. `--text-2xs` (11px) exists as the deliberate extra step for
// exactly the count-chip and keycap role the `ok` chip was rendering one pixel under, so the four
// one-offs collapse onto three real steps: 2xs for the chips and the folded output, xs for the
// command line and reasoning, sm for assistant prose.
function ExitChip({ exitCode }: { exitCode: number | undefined }) {
	if (exitCode === undefined) return null;
	return (
		<span
			className={cn(
				'shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-2xs leading-none ring-1 ring-inset',
				exitCode === 0 ? toneBadge.emerald : toneBadge.red,
			)}>
			{exitCode === 0 ? 'ok' : `exit ${exitCode}`}
		</span>
	);
}

function ToolEntryRow({ entry, find }: { entry: ToolConsoleEntry; find: string }) {
	const outputLineCount = entry.output === undefined ? 0 : entry.output.split('\n').length;
	return (
		<div className="rounded-md border border-border bg-muted">
			<div className="flex items-start gap-2 px-2.5 py-1.5">
				<span aria-hidden="true" className="font-mono text-accent select-none">
					$
				</span>
				{/* `break-words`, not `break-all`. A command already offers break opportunities and
				    breaking anywhere else corrupts it: in a 510px box `--porcelain=v2` split as
				    `--porcel` / `ain=v2` and `--numstat` as `-` / `-numstat`, so a double-dash flag
				    read as a single dash and a stray token. This is the one class of string in the
				    app where a wrong character is a wrong command. The raw output `<pre>` below
				    keeps `break-all`: there is no word structure there to respect. */}
				<code className="min-w-0 flex-1 font-mono break-words whitespace-pre-wrap text-foreground">
					{text(entry.title, find)}
				</code>
				<ExitChip exitCode={entry.exitCode} />
			</div>
			{entry.detail ? (
				<p className="px-2.5 pb-1.5 font-mono text-2xs break-all text-muted-foreground">
					{text(entry.detail, find)}
				</p>
			) : null}
			{entry.output ? (
				<details className="border-t border-border">
					<summary className="cursor-pointer px-2.5 py-1 text-2xs text-muted-foreground select-none hover:text-foreground">
						output ({outputLineCount} {outputLineCount === 1 ? 'line' : 'lines'}
						{entry.outputTruncated ? ', truncated' : ''})
					</summary>
					<pre className="max-h-64 overflow-auto px-2.5 pb-2 font-mono text-2xs break-all whitespace-pre-wrap text-muted-foreground">
						{text(entry.output, find)}
					</pre>
				</details>
			) : null}
		</div>
	);
}

function EntryRow({ entry, find }: { entry: ConsoleEntry; find: string }) {
	if (entry.kind === 'tool') return <ToolEntryRow entry={entry} find={find} />;
	if (entry.kind === 'reasoning') {
		return (
			<p className="border-l-2 border-border pl-3 text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground italic">
				{text(entry.text, find)}
			</p>
		);
	}
	if (entry.kind === 'text') {
		return (
			<p className="border-l-2 border-accent pl-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
				{text(entry.text, find)}
			</p>
		);
	}
	if (entry.kind === 'usage') {
		return <p className="font-mono text-2xs text-muted-foreground">{text(entry.text, find)}</p>;
	}
	if (entry.kind === 'note') {
		return (
			<p
				className={cn(
					'rounded-md border px-2.5 py-1.5 break-words whitespace-pre-wrap',
					entry.tone === 'error'
						? `${toneBorder.red} ${toneSurface.red} ${toneText.red}`
						: `${toneBorder.amber} ${toneSurface.amber} ${toneText.amber}`,
				)}>
				{text(entry.text, find)}
			</p>
		);
	}
	return (
		<pre className="font-mono break-all whitespace-pre-wrap text-muted-foreground">
			{text(entry.text, find)}
		</pre>
	);
}

export function LiveConsolePretty({ entries, find }: { entries: ConsoleEntry[]; find: string }) {
	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground">
				{find
					? `No entries match “${find}”.`
					: 'No renderable events yet — switch to Raw to see the unparsed stream.'}
			</p>
		);
	}
	return (
		<div className="space-y-2">
			{entries.map((entry, index) => (
				// Index keys are stable here: the transcript is append-only, so re-parses only
				// extend the list (and DOM state like an open <details> survives).
				<EntryRow entry={entry} find={find} key={index} />
			))}
		</div>
	);
}
