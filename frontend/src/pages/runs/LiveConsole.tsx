/* eslint-disable react-hooks/set-state-in-effect */
import { default as ArrowDownToLine } from 'lucide-react/dist/esm/icons/arrow-down-to-line';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { RunRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { backendConsoleLimit } from '../../lib/backends.ts';
import { cn } from '../../lib/cn.ts';
import { entrySearchText, parseConsoleEntries } from './consoleEntries.ts';
import { LiveConsoleControls } from './LiveConsoleControls.tsx';
import { LiveConsoleNotices } from './LiveConsoleNotices.tsx';
import {
	type ConsoleView,
	readViewPreference,
	readWrapPreference,
	writeViewPreference,
	writeWrapPreference,
} from './liveConsolePrefs.ts';
import { LiveConsolePretty } from './LiveConsolePretty.tsx';
import { highlightLine } from './liveConsoleText.tsx';
import { describeWindow } from './liveConsoleWindow.ts';
import { RunDetailPanel } from './RunDetailPanel.tsx';
import { useConsoleScroll } from './useConsoleScroll.ts';

export interface LiveConsoleBadge {
	label: string;
	tone: 'neutral' | 'teal';
}

// Bound the pretty view's DOM by entry count rather than by transcript bytes, so a long tail of
// assistant prose cannot evict the tool calls an operator opened the console to see.
const MAX_PRETTY_ENTRIES = 2000;

export function LiveConsole({
	badge,
	hasOutput,
	message,
	selectedRun,
	sourceTotalBytes,
	stopDetail,
}: {
	badge: LiveConsoleBadge | null;
	hasOutput: boolean;
	message: string;
	selectedRun: RunRecord | undefined;
	// Full transcript size on disk, when known. The fetched `message` may be shorter (server tail
	// cap) or longer (live stream past the snapshot), so the displayed total is the larger of the two.
	sourceTotalBytes?: null | number;
	stopDetail: null | string;
}) {
	const isTerminal = selectedRun !== undefined && selectedRun.status !== 'running';
	const showPanel = isTerminal;
	// Default the console collapsed for every terminal run (failed, killed, stopped, and clean
	// completions) so the structured panel reads as primary and the operator opts in to the
	// transcript via "Show console". Running runs keep the stream open — live streaming output
	// is the point and there is no toggle for them.
	const collapsedByDefault = isTerminal;
	const [consoleOpen, setConsoleOpen] = useState(!collapsedByDefault);
	const [view, setView] = useState<ConsoleView>(readViewPreference);
	const [wrap, setWrap] = useState(readWrapPreference);
	const [findQuery, setFindQuery] = useState('');
	const { handleScroll, jumpToLatest, pinnedToBottom, resetPin, scrollRef } = useConsoleScroll(
		consoleOpen,
		[message, findQuery.trim(), wrap, hasOutput ? view : 'raw'],
	);
	// Reselecting a different run must re-derive the default, otherwise the toggle sticks
	// to whatever the previously selected run left it at. Find and scroll pinning are also
	// per-run state, so reset them when the operator switches runs.
	useEffect(() => {
		setConsoleOpen(!collapsedByDefault);
		setFindQuery('');
		resetPin();
	}, [selectedRun?.id, collapsedByDefault, resetPin]);
	useEffect(() => {
		writeWrapPreference(wrap);
	}, [wrap]);
	useEffect(() => {
		writeViewPreference(view);
	}, [view]);

	// Placeholder/status messages are prose, not a transcript; render them as plain text
	// regardless of the preferred view.
	const effectiveView: ConsoleView = hasOutput ? view : 'raw';
	const trimmedFind = findQuery.trim();

	// These derived values are plain expressions — the React Compiler memoizes them per their
	// inputs, so the slice/parse runs once per new-output frame rather than on every re-render.
	const { isWindowed, messageBytes, renderedBytes, renderedMessage, totalBytes } = describeWindow(
		message,
		sourceTotalBytes,
	);

	const findNeedle = trimmedFind.toLowerCase();
	const matchingLines =
		trimmedFind && effectiveView === 'raw'
			? message.split('\n').filter((line) => line.toLowerCase().includes(findNeedle))
			: null;

	// Pretty parses the whole loaded transcript, not the raw byte tail: a chatty backend can push
	// megabytes of assistant text after its last tool call, so windowing the bytes first drops
	// every tool call from the structured view while the run's own stats still report them. Entries
	// are structural and far fewer than lines, so the DOM is bounded by count instead.
	const allEntries =
		effectiveView === 'pretty' ? parseConsoleEntries(message, selectedRun?.backend) : [];
	const entries =
		allEntries.length > MAX_PRETTY_ENTRIES
			? allEntries.slice(allEntries.length - MAX_PRETTY_ENTRIES)
			: allEntries;
	const visibleEntries = trimmedFind
		? entries.filter((entry) => entrySearchText(entry).toLowerCase().includes(findNeedle))
		: entries;
	const consoleLimit = backendConsoleLimit(selectedRun?.backend);

	async function copyAll(): Promise<void> {
		try {
			await navigator.clipboard.writeText(message);
			toast.success('Console transcript copied');
		} catch {
			toast.error('Could not copy console transcript');
		}
	}

	const showControls = consoleOpen && hasOutput;
	const matchCount = trimmedFind
		? effectiveView === 'pretty'
			? visibleEntries.length
			: (matchingLines?.length ?? 0)
		: null;

	return (
		// On wide screens the column above is sticky at a fixed viewport height, and this flex
		// chain (every level carrying min-h-0 so it may shrink below its content) hands the
		// leftover space to the transcript scroller. The header, detail panel, controls, and
		// notices all vary in height per run, which is why this is a flex chain rather than a
		// calc() subtraction.
		<section className="flex min-h-0 flex-col 2xl:flex-1">
			<Card className="flex min-h-0 flex-1 flex-col" variant="panel">
				{/* Title, icon and stream badge sit in the house header row inside the card rather
				    than floating above it, matching Active/History and the dashboard cards. */}
				<CardHeader
					badge={badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : undefined}
					className="mb-3"
					icon={<Terminal aria-hidden="true" className="h-4 w-4 text-accent" />}
					title="Live Console"
				/>
				{showPanel && selectedRun ? (
					// The metadata is what gives, not the transcript. Inside the fixed-height sticky
					// column this block is unbounded and grows with the run — commits, file changes,
					// a stop transcript — and a flex item's `min-height: auto` meant it could not be
					// asked to shrink, so it took the column and left the console output a ~32px
					// sliver showing one line of a 53,000px transcript. `min-h-0` makes it
					// shrinkable and `overflow-y-auto` gives it somewhere to put what it loses.
					<div className="2xl:min-h-0 2xl:overflow-y-auto">
						<RunDetailPanel selectedRun={selectedRun} stopDetail={stopDetail} />
					</div>
				) : selectedRun?.summary ? (
					<p className="mb-3 text-xs break-words text-muted-foreground">
						<span className="font-medium text-foreground">Summary:</span>{' '}
						{selectedRun.summary}
					</p>
				) : null}
				{showPanel ? (
					<Button
						aria-expanded={consoleOpen}
						// self-start: as a flex-column child it stretched to the card's full width and
						// read as a centred divider instead of a control on the panel's left edge.
						className="mb-2 self-start"
						onClick={() => setConsoleOpen((open) => !open)}
						size="compact"
						variant="ghost">
						<ChevronRight
							aria-hidden="true"
							className={`h-4 w-4 transition-transform ${consoleOpen ? 'rotate-90' : ''}`}
						/>
						{consoleOpen ? 'Hide console' : 'Show console'}
					</Button>
				) : null}
				{showControls ? (
					<LiveConsoleControls
						find={findQuery}
						matchCount={matchCount}
						onCopyAll={() => void copyAll()}
						onFindChange={setFindQuery}
						onViewChange={setView}
						onWrapToggle={() => setWrap((value) => !value)}
						view={view}
						wrap={wrap}
					/>
				) : null}
				{consoleOpen ? (
					<div className="relative flex min-h-0 flex-1 flex-col">
						{showControls ? (
							<LiveConsoleNotices
								consoleLimit={consoleLimit}
								isPretty={effectiveView === 'pretty'}
								shownBytes={
									effectiveView === 'pretty' ? messageBytes : renderedBytes
								}
								showWindowNotice={isWindowed && !trimmedFind}
								totalBytes={totalBytes}
							/>
						) : null}
						<div
							aria-label="Run console output"
							// Themed tokens, not a raw hex: the scroller recedes one step to
							// `background` under the `card` panel around it and follows the light/dark
							// theme. The height is capped against the viewport as well as in pixels so
							// the console cannot push History off a 900px-tall screen.
							//
							// The `2xl` floor is the other half of making the detail block shrink:
							// `flex-1` on a `basis: 0` item claims free space but concedes all of it
							// the moment there is none, which is exactly the state a long metadata
							// block creates. 27rem is 20 lines of `text-xs leading-relaxed` (12px ×
							// 1.625 = 19.5px, so 390px) plus the 32px of `p-4` — the floor the panel
							// has to clear to be worth opening at all.
							className="h-[min(560px,45vh)] w-full max-w-full overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-foreground shadow-inner 2xl:h-auto 2xl:min-h-[27rem] 2xl:flex-1"
							onScroll={handleScroll}
							ref={scrollRef}>
							{effectiveView === 'pretty' ? (
								<LiveConsolePretty entries={visibleEntries} find={trimmedFind} />
							) : (
								<pre
									className={cn(
										'font-mono',
										wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre',
									)}>
									{matchingLines ? (
										matchingLines.length === 0 ? (
											<span className="text-muted-foreground">
												No lines match “{trimmedFind}”.
											</span>
										) : (
											matchingLines.map((line, index) => (
												<span className="block" key={`${index}-${line}`}>
													{highlightLine(line, trimmedFind)}
												</span>
											))
										)
									) : (
										renderedMessage
									)}
								</pre>
							)}
						</div>
						{showControls && !pinnedToBottom ? (
							<Button
								aria-label="Jump to latest output"
								// Position only: the primary variant already owns the fill, border,
								// hover and focus ring this used to overpaint.
								className="absolute right-3 bottom-3 shadow-lg"
								onClick={jumpToLatest}
								size="compact"
								variant="primary">
								<ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />
								Jump to latest
							</Button>
						) : null}
					</div>
				) : null}
			</Card>
		</section>
	);
}
