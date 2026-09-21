/* eslint-disable react-hooks/set-state-in-effect */
import { default as ArrowDownToLine } from 'lucide-react/dist/esm/icons/arrow-down-to-line';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { RunRecord } from '../../api/types.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { backendConsoleLimit } from '../../lib/backends.ts';
import { cn } from '../../lib/cn.ts';
import { entrySearchText, MAX_PRETTY_ENTRIES, parseConsoleEntries } from './consoleEntries.ts';
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
import { LiveConsoleWindowNav } from './LiveConsoleWindowNav.tsx';
import { RunDetailPanel } from './RunDetailPanel.tsx';
import { isTerminalStatus } from './runsUtils.ts';
import { useConsoleScroll } from './useConsoleScroll.ts';
import { useLiveConsoleWindow } from './useLiveConsoleWindow.ts';

export interface LiveConsoleBadge {
	label: string;
	tone: 'neutral' | 'teal';
}

export function LiveConsole({
	badge,
	hasOutput,
	hasSelection,
	message,
	selectedRun,
	sourceEndByte,
	sourceStartByte,
	sourceTotalBytes,
	stopDetail,
	windowLimitBytes,
}: {
	badge: LiveConsoleBadge | null;
	hasOutput: boolean;
	hasSelection: boolean;
	message: string;
	selectedRun: RunRecord | undefined;
	sourceEndByte?: null | number;
	sourceStartByte?: null | number;
	sourceTotalBytes?: null | number;
	stopDetail: null | string;
	windowLimitBytes?: null | number;
}) {
	const isTerminal = selectedRun !== undefined && isTerminalStatus(selectedRun.status);
	const showPanel = isTerminal;
	const collapsedByDefault = isTerminal;
	const [consoleOpen, setConsoleOpen] = useState(!collapsedByDefault);
	const [view, setView] = useState<ConsoleView>(readViewPreference);
	const [wrap, setWrap] = useState(readWrapPreference);
	const [findQuery, setFindQuery] = useState('');
	const {
		browsedWindow,
		displayedMessage,
		isLoadingWindow,
		loadWindow,
		returnLive,
		transcriptWindow,
	} = useLiveConsoleWindow({
		message,
		selectedRun,
		sourceEndByte,
		sourceStartByte,
		sourceTotalBytes,
		windowLimitBytes,
	});
	const displayedHasOutput = browsedWindow ? browsedWindow.output.length > 0 : hasOutput;
	const { handleScroll, jumpToLatest, pinnedToBottom, scrollRef } = useConsoleScroll(
		consoleOpen,
		[displayedMessage, findQuery.trim(), wrap, displayedHasOutput ? view : 'raw'],
	);
	useEffect(() => {
		setConsoleOpen(!collapsedByDefault);
		setFindQuery('');
	}, [selectedRun?.id, collapsedByDefault]);
	useEffect(() => {
		writeWrapPreference(wrap);
	}, [wrap]);
	useEffect(() => {
		writeViewPreference(view);
	}, [view]);

	if (!hasSelection) {
		return (
			<section className="flex min-h-0 flex-col">
				<Card className="flex flex-col" variant="panel">
					<CardHeader
						className="mb-2"
						icon={<Terminal aria-hidden="true" className="h-4 w-4 text-accent" />}
						title="Live Console"
					/>
					<EmptyState className="text-xs">{message}</EmptyState>
				</Card>
			</section>
		);
	}

	const effectiveView: ConsoleView = displayedHasOutput ? view : 'raw';
	const trimmedFind = findQuery.trim();

	const { isWindowed, messageBytes, renderedBytes, renderedMessage } = describeWindow(
		displayedMessage,
		browsedWindow?.totalBytes ?? sourceTotalBytes,
	);

	const findNeedle = trimmedFind.toLowerCase();
	const matchingLines =
		trimmedFind && effectiveView === 'raw'
			? displayedMessage.split('\n').filter((line) => line.toLowerCase().includes(findNeedle))
			: null;

	const allEntries =
		effectiveView === 'pretty'
			? parseConsoleEntries(displayedMessage, selectedRun?.backend)
			: [];
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
			await navigator.clipboard.writeText(displayedMessage);
			toast.success(browsedWindow ? 'Console window copied' : 'Console transcript copied');
		} catch {
			toast.error('Could not copy console transcript');
		}
	}

	const showControls = consoleOpen && displayedHasOutput;
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
		<section className="flex min-h-0 flex-col @min-[88.375rem]:flex-1">
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
					<div className="@min-[88.375rem]:min-h-0 @min-[88.375rem]:overflow-y-auto">
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
						<DisclosureMarker open={consoleOpen} />
						{consoleOpen ? 'Hide console' : 'Show console'}
					</Button>
				) : null}
				{showControls ? (
					<LiveConsoleControls
						copyLabel={browsedWindow ? 'Copy window' : 'Copy all'}
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
						{showControls &&
						(transcriptWindow.startByte > 0 ||
							transcriptWindow.endByte < transcriptWindow.totalBytes ||
							browsedWindow !== null) ? (
							<LiveConsoleWindowNav
								isBrowsing={browsedWindow !== null}
								isLoading={isLoadingWindow}
								onRequest={(window) => void loadWindow(window)}
								onReturnLive={returnLive}
								window={transcriptWindow}
							/>
						) : null}
						{showControls ? (
							<LiveConsoleNotices
								consoleLimit={consoleLimit}
								isPretty={effectiveView === 'pretty'}
								shownBytes={
									effectiveView === 'pretty' ? messageBytes : renderedBytes
								}
								showWindowNotice={isWindowed && !trimmedFind}
								totalBytes={messageBytes}
							/>
						) : null}
						<div
							aria-label="Run console output"
							// Themed tokens, not a raw hex: the scroller recedes one step to
							// `background` under the `card` panel around it and follows the light/dark
							// theme. At stacked widths it grows naturally up to a viewport-aware cap;
							// at split widths the column owns the budget and this takes its remainder.
							//
							className="max-h-[min(560px,45vh)] w-full max-w-full overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-foreground shadow-inner @min-[88.375rem]:max-h-none @min-[88.375rem]:min-h-0 @min-[88.375rem]:flex-1"
							onScroll={handleScroll}
							ref={scrollRef}
							role="region">
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
								// hover and focus ring, so nothing here overpaints them.
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
