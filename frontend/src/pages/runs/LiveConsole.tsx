/* eslint-disable react-hooks/set-state-in-effect */
import { default as ArrowDownToLine } from 'lucide-react/dist/esm/icons/arrow-down-to-line';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { RunRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { formatBytes } from '../../lib/formatters.ts';
import { entrySearchText, parseConsoleEntries } from './consoleEntries.ts';
import { LiveConsoleControls } from './LiveConsoleControls.tsx';
import {
	type ConsoleView,
	readViewPreference,
	readWrapPreference,
	writeViewPreference,
	writeWrapPreference,
} from './liveConsolePrefs.ts';
import { LiveConsolePretty } from './LiveConsolePretty.tsx';
import { highlightLine, windowTail } from './liveConsoleText.tsx';
import { RunDetailPanel } from './RunDetailPanel.tsx';

export interface LiveConsoleBadge {
	label: string;
	tone: 'neutral' | 'teal';
}

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
	const [pinnedToBottom, setPinnedToBottom] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);
	// Mirror of pinnedToBottom for reads inside the content-follow effect without making that
	// effect re-run on every pin/unpin toggle (which would fight an in-flight jump animation).
	const pinnedRef = useRef(true);
	// True while a programmatic jump-to-bottom is animating, so the scroll handler ignores the
	// intermediate positions of that animation instead of treating them as the operator
	// scrolling up and unpinning.
	const programmaticScrollRef = useRef(false);
	function setPinned(value: boolean): void {
		pinnedRef.current = value;
		setPinnedToBottom(value);
	}
	// Reselecting a different run must re-derive the default, otherwise the toggle sticks
	// to whatever the previously selected run left it at. Find and scroll pinning are also
	// per-run state, so reset them when the operator switches runs.
	useEffect(() => {
		setConsoleOpen(!collapsedByDefault);
		setFindQuery('');
		programmaticScrollRef.current = false;
		setPinned(true);
	}, [selectedRun?.id, collapsedByDefault]);
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

	// Lay out only the trailing window of the transcript (see MAX_RENDERED_CHARS). These derived
	// values are plain expressions — the React Compiler memoizes them per its inputs, so the
	// slice/parse runs once per new-output frame rather than on every unrelated re-render. The
	// displayed total is the larger of what we hold in memory and the server's reported on-disk
	// size, so a server-side tail cap still reports the true file size.
	const renderedMessage = windowTail(message);
	const totalBytes = Math.max(message.length, sourceTotalBytes ?? 0);
	const isWindowed = renderedMessage.length < message.length || totalBytes > message.length;

	const findNeedle = trimmedFind.toLowerCase();
	const matchingLines =
		trimmedFind && effectiveView === 'raw'
			? message.split('\n').filter((line) => line.toLowerCase().includes(findNeedle))
			: null;

	const entries =
		effectiveView === 'pretty'
			? parseConsoleEntries(renderedMessage, selectedRun?.backend)
			: [];
	const visibleEntries = trimmedFind
		? entries.filter((entry) => entrySearchText(entry).toLowerCase().includes(findNeedle))
		: entries;

	// Follow new output to the bottom while the operator stays pinned there. Plain scrollTop
	// (instant, no animation) so streaming output does not fight a running scroll animation and so
	// there is nothing to suppress for prefers-reduced-motion; the explicit jump uses smooth.
	// Reads pinnedRef rather than depending on pinnedToBottom so a pin/unpin toggle alone does not
	// re-trigger an instant snap mid-jump.
	useEffect(() => {
		if (!consoleOpen || !pinnedRef.current) return;
		const node = scrollRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
	}, [renderedMessage, trimmedFind, wrap, consoleOpen, effectiveView]);

	function handleScroll(): void {
		const node = scrollRef.current;
		if (!node) return;
		const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
		if (programmaticScrollRef.current) {
			// Ignore the animation's intermediate frames; only release the guard once it lands.
			if (atBottom) {
				programmaticScrollRef.current = false;
				setPinned(true);
			}
			return;
		}
		setPinned(atBottom);
	}

	function jumpToLatest(): void {
		const node = scrollRef.current;
		if (!node) return;
		programmaticScrollRef.current = true;
		setPinned(true);
		node.scrollTo({
			behavior: prefersReducedMotion() ? 'auto' : 'smooth',
			top: node.scrollHeight,
		});
		// Safety release in case the animation is interrupted (e.g. content grows mid-scroll) and
		// the at-bottom frame never fires, which would otherwise leave the operator unable to unpin.
		window.setTimeout(() => {
			programmaticScrollRef.current = false;
		}, 700);
	}

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
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-foreground">Live Console</h2>
				{badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
			</div>
			<Card variant="panel">
				{showPanel && selectedRun ? (
					<RunDetailPanel selectedRun={selectedRun} stopDetail={stopDetail} />
				) : selectedRun?.summary ? (
					<p className="mb-3 text-xs break-words text-muted-foreground">
						<span className="font-medium text-foreground">Summary:</span>{' '}
						{selectedRun.summary}
					</p>
				) : null}
				{showPanel ? (
					<Button
						aria-expanded={consoleOpen}
						className="mb-2"
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
					<div className="relative">
						{showControls && isWindowed && !trimmedFind ? (
							<p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
								Showing the most recent {formatBytes(renderedMessage.length)} of{' '}
								{formatBytes(totalBytes)}. Older output is hidden — use “Copy all”
								for the full loaded transcript.
							</p>
						) : null}
						<div
							aria-label="Run console output"
							className="h-[520px] w-full max-w-full overflow-auto rounded-lg border border-neutral-800 bg-[#0a0e14] p-4 text-xs leading-relaxed text-neutral-200 shadow-inner"
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
											<span className="text-neutral-500">
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
								className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-md border border-teal-400/40 bg-neutral-900/90 px-2.5 py-1.5 text-xs font-medium text-teal-200 shadow-lg backdrop-blur hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
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
