/* eslint-disable react-hooks/set-state-in-effect */
import { default as ArrowDownToLine } from 'lucide-react/dist/esm/icons/arrow-down-to-line';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as WrapText } from 'lucide-react/dist/esm/icons/wrap-text';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { RunRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { formatBytes } from '../../lib/formatters.ts';
import { highlightLine, windowTail } from './liveConsoleText.tsx';
import { RunDetailPanel } from './RunDetailPanel.tsx';

export interface LiveConsoleBadge {
	label: string;
	tone: 'cyan' | 'neutral';
}

// Session-scoped so the wrap preference survives switching between runs (and reloads) within the
// tab, but does not leak into a fresh browser session. Plain sessionStorage rather than a Zustand
// persist store because the preference is local to this one console surface.
const WRAP_PREFERENCE_KEY = 'aidd.liveConsole.wrap';

function readWrapPreference(): boolean {
	try {
		return sessionStorage.getItem(WRAP_PREFERENCE_KEY) === '1';
	} catch {
		return false;
	}
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
	// Default the raw stream collapsed for every terminal run (failed, killed, stopped, and clean
	// completions) so the structured panel reads as primary and the operator opts in to the raw
	// transcript via "Show raw console". Running runs keep the stream open — live streaming output
	// is the point and there is no toggle for them.
	const collapsedByDefault = isTerminal;
	const [rawOpen, setRawOpen] = useState(!collapsedByDefault);
	const [wrap, setWrap] = useState(readWrapPreference);
	const [findQuery, setFindQuery] = useState('');
	const [pinnedToBottom, setPinnedToBottom] = useState(true);
	const scrollRef = useRef<HTMLPreElement>(null);
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
		setRawOpen(!collapsedByDefault);
		setFindQuery('');
		programmaticScrollRef.current = false;
		setPinned(true);
	}, [selectedRun?.id, collapsedByDefault]);
	useEffect(() => {
		try {
			sessionStorage.setItem(WRAP_PREFERENCE_KEY, wrap ? '1' : '0');
		} catch {
			// Storage can be unavailable (private mode quota); the in-memory toggle still works.
		}
	}, [wrap]);

	const trimmedFind = findQuery.trim();
	const matchingLines = useMemo(() => {
		if (!trimmedFind) return null;
		const needle = trimmedFind.toLowerCase();
		return message.split('\n').filter((line) => line.toLowerCase().includes(needle));
	}, [message, trimmedFind]);

	// Lay out only the trailing window of the transcript (see MAX_RENDERED_CHARS). Memoized so the
	// slice runs once per new-output frame rather than on every unrelated re-render. The displayed
	// total is the larger of what we hold in memory and the server's reported on-disk size, so a
	// server-side tail cap still reports the true file size.
	const renderedMessage = useMemo(() => windowTail(message), [message]);
	const totalBytes = Math.max(message.length, sourceTotalBytes ?? 0);
	const isWindowed = renderedMessage.length < message.length || totalBytes > message.length;

	// Follow new output to the bottom while the operator stays pinned there. Plain scrollTop
	// (instant, no animation) so streaming output does not fight a running scroll animation and so
	// there is nothing to suppress for prefers-reduced-motion; the explicit jump uses smooth.
	// Reads pinnedRef rather than depending on pinnedToBottom so a pin/unpin toggle alone does not
	// re-trigger an instant snap mid-jump.
	useEffect(() => {
		if (!rawOpen || !pinnedRef.current) return;
		const node = scrollRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
	}, [renderedMessage, trimmedFind, wrap, rawOpen]);

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

	const showControls = rawOpen && hasOutput;
	const matchCount = matchingLines?.length ?? 0;

	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<h2 className="font-display text-foreground text-sm font-semibold">Live Console</h2>
				{badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
			</div>
			<Card variant="panel">
				{showPanel && selectedRun ? (
					<RunDetailPanel selectedRun={selectedRun} stopDetail={stopDetail} />
				) : selectedRun?.summary ? (
					<p className="text-muted-foreground mb-3 text-xs break-words">
						<span className="text-foreground font-medium">Summary:</span>{' '}
						{selectedRun.summary}
					</p>
				) : null}
				{showPanel ? (
					<Button
						aria-expanded={rawOpen}
						className="mb-2"
						onClick={() => setRawOpen((open) => !open)}
						size="compact"
						variant="ghost">
						<ChevronRight
							aria-hidden="true"
							className={`h-4 w-4 transition-transform ${rawOpen ? 'rotate-90' : ''}`}
						/>
						{rawOpen ? 'Hide raw console' : 'Show raw console'}
					</Button>
				) : null}
				{showControls ? (
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<div className="relative w-full sm:w-56">
							<Search
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
							/>
							<Input
								aria-label="Find in console"
								className="w-full pr-8 pl-8"
								onChange={(event) => setFindQuery(event.target.value)}
								placeholder="Find in console"
								type="text"
								value={findQuery}
							/>
							{findQuery ? (
								<IconButton
									ariaLabel="Clear find"
									className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
									onClick={() => setFindQuery('')}
									variant="ghost">
									<X aria-hidden="true" className="h-3.5 w-3.5" />
								</IconButton>
							) : null}
						</div>
						{trimmedFind ? (
							<span className="text-xs text-neutral-500 dark:text-neutral-400">
								{matchCount} {matchCount === 1 ? 'match' : 'matches'}
							</span>
						) : null}
						<div className="flex items-center gap-2 sm:ml-auto">
							<Button
								aria-pressed={wrap}
								onClick={() => setWrap((value) => !value)}
								variant="ghost">
								<WrapText aria-hidden="true" className="h-3.5 w-3.5" />
								{wrap ? 'No wrap' : 'Wrap'}
							</Button>
							<Button onClick={() => void copyAll()} variant="ghost">
								<Copy aria-hidden="true" className="h-3.5 w-3.5" />
								Copy all
							</Button>
						</div>
					</div>
				) : null}
				{rawOpen ? (
					<div className="relative">
						{showControls && isWindowed && !trimmedFind ? (
							<p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
								Showing the most recent {formatBytes(renderedMessage.length)} of{' '}
								{formatBytes(totalBytes)}. Older output is hidden — use “Copy all”
								for the full loaded transcript.
							</p>
						) : null}
						<pre
							aria-label="Run console output"
							className={cn(
								'h-[520px] w-full max-w-full overflow-auto rounded-lg border border-neutral-800 bg-[#0a0e14] p-4 text-xs leading-relaxed text-neutral-200 shadow-inner',
								wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre'
							)}
							onScroll={handleScroll}
							ref={scrollRef}>
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
