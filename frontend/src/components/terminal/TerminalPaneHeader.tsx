import { useQuery } from '@tanstack/react-query';
import { default as Maximize2 } from 'lucide-react/dist/esm/icons/maximize-2';
import { default as Minimize2 } from 'lucide-react/dist/esm/icons/minimize-2';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { TerminalStatus, TerminalTab } from './terminalState.ts';

import { fetchTerminalShells } from '../../api/terminal.ts';
import { cn } from '../../lib/cn.ts';
import { shortcutText, terminalShortcut } from '../../lib/keyboardShortcuts.ts';
import { type Tone } from '../../lib/tones.ts';
import { useTerminalStore } from '../../stores/terminalStore.ts';
import { OverflowScroller } from '../shared/OverflowScroller.tsx';
import { StatusDot } from '../ui/badge.tsx';
import { IconButton } from '../ui/button.tsx';
import { closeTerminalTab, createTerminalTab, restartTerminalTab } from './terminalSessions.ts';

const statusStyles: Record<TerminalStatus, { label: string; pulse?: boolean; tone: Tone }> = {
	connected: { label: 'Connected', tone: 'emerald' },
	connecting: { label: 'Connecting…', pulse: true, tone: 'amber' },
	exited: { label: 'Session ended', tone: 'neutral' },
};

/** Last path segment of a Windows or POSIX directory, for compact tab labels. */
function baseName(path: string): string {
	const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0);
	return segments[segments.length - 1] ?? path;
}

export function TerminalPaneHeader({
	activeSessionId,
	tabs,
}: {
	activeSessionId: null | string;
	tabs: TerminalTab[];
}) {
	const shellId = useTerminalStore((state) => state.shellId);
	const setShellId = useTerminalStore((state) => state.setShellId);
	const setActiveSessionId = useTerminalStore((state) => state.setActiveSessionId);
	const maximized = useTerminalStore((state) => state.maximized);
	const setMaximized = useTerminalStore((state) => state.setMaximized);
	const toggleOpen = useTerminalStore((state) => state.toggleOpen);
	const shellsQuery = useQuery({
		queryFn: fetchTerminalShells,
		queryKey: ['terminal-shells'],
		retry: false,
		staleTime: Infinity,
	});
	const shells = shellsQuery.data?.shells ?? [];
	const shellLabel = (id: string) => shells.find((shell) => shell.id === id)?.label ?? id;
	const activeTab = tabs.find((tab) => tab.info.sessionId === activeSessionId);
	const indicator = activeTab ? statusStyles[activeTab.status] : statusStyles.connecting;

	return (
		<header className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-200 px-2 dark:border-teal-950/50">
			<span
				className="ml-1 text-[0.65rem] font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400"
				title={`Toggle with ${shortcutText(terminalShortcut.keys)}`}>
				Terminal
			</span>
			{/* The label rides on the wrapper because `StatusDot` is `aria-hidden`: this dot is the
			    only report of the terminal's connection state, so it has to be said in text. */}
			<span
				aria-label={`Terminal status: ${indicator.label}`}
				className="inline-flex items-center"
				role="status"
				title={indicator.label}>
				<StatusDot pulse={indicator.pulse ?? false} tone={indicator.tone} />
			</span>
			{/* A strip of session tabs that scrolls once a few terminals are open, so it gets the
			    same edge cue and keyboard-reachable scrollport as every other strip. */}
			<OverflowScroller ariaLabel="Terminal tabs" className="min-w-0 flex-1">
				<div className="flex items-center gap-1">
					{tabs.map((tab) => {
						const isActive = tab.info.sessionId === activeSessionId;
						return (
							<span
								className={cn(
									'flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs',
									isActive
										? 'border-teal-400/60 bg-teal-50 text-neutral-800 dark:bg-teal-950/40 dark:text-neutral-100'
										: 'border-neutral-200 text-neutral-500 hover:text-neutral-700 dark:border-teal-950/50 dark:hover:text-neutral-300',
									tab.status === 'exited' && 'opacity-60',
								)}
								key={tab.info.sessionId}>
								<button
									className="max-w-40 truncate"
									onClick={() => setActiveSessionId(tab.info.sessionId)}
									title={`${tab.info.cwd} — ${shellLabel(tab.info.shellId)}`}
									type="button">
									{baseName(tab.info.cwd)}
								</button>
								<button
									aria-label={`Close terminal tab ${baseName(tab.info.cwd)}`}
									className="rounded hover:bg-neutral-200/60 dark:hover:bg-slate-800"
									onClick={() => void closeTerminalTab(tab.info.sessionId)}
									type="button">
									<X className="h-3 w-3" />
								</button>
							</span>
						);
					})}
					<IconButton
						ariaLabel="New terminal tab"
						className="shrink-0 sm:h-6 sm:w-6"
						onClick={() => void createTerminalTab()}
						variant="ghost">
						<Plus className="h-3.5 w-3.5" />
					</IconButton>
				</div>
			</OverflowScroller>
			{shells.length > 0 && (
				<select
					aria-label="Shell for new tabs"
					className="h-6 rounded border border-neutral-200 bg-white px-1 text-xs text-neutral-700 focus-visible:ring-2 focus-visible:ring-teal-400 dark:border-teal-950/50 dark:bg-slate-900 dark:text-neutral-300"
					onChange={(event) => setShellId(event.target.value)}
					title="Shell used for new tabs"
					value={shellId ?? shells[0]?.id ?? ''}>
					{shells.map((shell) => (
						<option key={shell.id} value={shell.id}>
							{shell.label}
						</option>
					))}
				</select>
			)}
			<div className="flex items-center gap-1">
				<IconButton
					ariaLabel="Restart terminal session"
					className="sm:h-7 sm:w-7"
					disabled={!activeSessionId}
					onClick={() => {
						if (activeSessionId) void restartTerminalTab(activeSessionId);
					}}
					variant="ghost">
					<RotateCcw className="h-3.5 w-3.5" />
				</IconButton>
				<IconButton
					ariaLabel={maximized ? 'Restore terminal size' : 'Maximize terminal'}
					className="sm:h-7 sm:w-7"
					onClick={() => setMaximized(!maximized)}
					variant="ghost">
					{maximized ? (
						<Minimize2 className="h-3.5 w-3.5" />
					) : (
						<Maximize2 className="h-3.5 w-3.5" />
					)}
				</IconButton>
				<IconButton
					ariaLabel="Close terminal"
					className="sm:h-7 sm:w-7"
					onClick={toggleOpen}
					variant="ghost">
					<X className="h-3.5 w-3.5" />
				</IconButton>
			</div>
		</header>
	);
}
