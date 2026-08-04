import type { ReactNode } from 'react';

import type { ConsoleEntry, ToolConsoleEntry } from './consoleEntries.ts';

import { cn } from '../../lib/cn.ts';
import { highlightLine } from './liveConsoleText.tsx';

function text(value: string, find: string): ReactNode {
	return find ? highlightLine(value, find) : value;
}

function ExitChip({ exitCode }: { exitCode: number | undefined }) {
	if (exitCode === undefined) return null;
	return (
		<span
			className={cn(
				'shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none',
				exitCode === 0
					? 'bg-emerald-500/15 text-emerald-300'
					: 'bg-red-500/15 text-red-300',
			)}>
			{exitCode === 0 ? 'ok' : `exit ${exitCode}`}
		</span>
	);
}

function ToolEntryRow({ entry, find }: { entry: ToolConsoleEntry; find: string }) {
	const outputLineCount = entry.output === undefined ? 0 : entry.output.split('\n').length;
	return (
		<div className="rounded-md border border-white/10 bg-black/20">
			<div className="flex items-start gap-2 px-2.5 py-1.5">
				<span aria-hidden="true" className="font-mono text-teal-400 select-none">
					$
				</span>
				<code className="min-w-0 flex-1 font-mono break-all whitespace-pre-wrap text-white/85">
					{text(entry.title, find)}
				</code>
				<ExitChip exitCode={entry.exitCode} />
			</div>
			{entry.detail ? (
				<p className="px-2.5 pb-1.5 font-mono text-[10px] break-all text-white/45">
					{text(entry.detail, find)}
				</p>
			) : null}
			{entry.output ? (
				<details className="border-t border-white/10">
					<summary className="cursor-pointer px-2.5 py-1 text-[11px] text-white/55 select-none hover:text-white/85">
						output ({outputLineCount} {outputLineCount === 1 ? 'line' : 'lines'}
						{entry.outputTruncated ? ', truncated' : ''})
					</summary>
					<pre className="max-h-64 overflow-auto px-2.5 pb-2 font-mono text-[11px] break-all whitespace-pre-wrap text-white/55">
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
			<p className="border-l-2 border-white/10 pl-3 text-[12px] leading-relaxed break-words whitespace-pre-wrap text-white/45 italic">
				{text(entry.text, find)}
			</p>
		);
	}
	if (entry.kind === 'text') {
		return (
			<p className="border-l-2 border-teal-500/60 pl-3 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-white/90">
				{text(entry.text, find)}
			</p>
		);
	}
	if (entry.kind === 'usage') {
		return <p className="font-mono text-[11px] text-white/45">{text(entry.text, find)}</p>;
	}
	if (entry.kind === 'note') {
		return (
			<p
				className={cn(
					'rounded-md border px-2.5 py-1.5 break-words whitespace-pre-wrap',
					entry.tone === 'error'
						? 'border-red-500/40 bg-red-500/10 text-red-300'
						: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
				)}>
				{text(entry.text, find)}
			</p>
		);
	}
	return (
		<pre className="font-mono break-all whitespace-pre-wrap text-white/45">
			{text(entry.text, find)}
		</pre>
	);
}

export function LiveConsolePretty({ entries, find }: { entries: ConsoleEntry[]; find: string }) {
	if (entries.length === 0) {
		return (
			<p className="text-white/45">
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
