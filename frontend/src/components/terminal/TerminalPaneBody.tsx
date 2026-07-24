import { useEffect } from 'react';

import { useTerminalStore } from '../../stores/terminalStore.ts';
import { TerminalPaneHeader } from './TerminalPaneHeader.tsx';
import { ensureTerminalReady, retryTerminal } from './terminalSessions.ts';
import { useTerminalTabs, useTerminalUnavailable } from './terminalState.ts';
import { TerminalTabView } from './TerminalTabView.tsx';

/**
 * The pane's content: tab strip header plus one persistent xterm host per session. Mounts once
 * per app lifetime (behind the lazy boundary in TerminalPane) and keeps every tab's Terminal
 * instance across pane hide/show and tab switches.
 */
export function TerminalPaneBody() {
	const open = useTerminalStore((state) => state.open);
	const activeSessionId = useTerminalStore((state) => state.activeSessionId);
	const tabs = useTerminalTabs();
	const unavailable = useTerminalUnavailable();

	// Adopt the server's live sessions (or spawn the first one) whenever the pane is opened.
	useEffect(() => {
		if (open) void ensureTerminalReady();
	}, [open]);

	// The stored active id may point at a tab that no longer exists — fall back to the first tab.
	const effectiveActive = tabs.some((tab) => tab.info.sessionId === activeSessionId)
		? activeSessionId
		: (tabs[0]?.info.sessionId ?? null);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TerminalPaneHeader activeSessionId={effectiveActive} tabs={tabs} />
			{unavailable ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
					<p>Terminal is unavailable on this host (PTY backend failed to load).</p>
					<button
						className="text-teal-600 underline-offset-2 hover:underline dark:text-teal-400"
						onClick={retryTerminal}
						type="button">
						Try again
					</button>
				</div>
			) : (
				<div className="min-h-0 flex-1">
					{tabs.map((tab) => (
						<TerminalTabView
							active={tab.info.sessionId === effectiveActive}
							key={tab.info.sessionId}
							sessionId={tab.info.sessionId}
						/>
					))}
				</div>
			)}
		</div>
	);
}
