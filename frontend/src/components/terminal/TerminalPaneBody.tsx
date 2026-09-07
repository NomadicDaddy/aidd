import { useEffect } from 'react';

import { useTerminalStore } from '../../stores/terminalStore.ts';
import { TerminalPaneHeader } from './TerminalPaneHeader.tsx';
import { ensureTerminalReady, retryTerminal } from './terminalSessions.ts';
import { useTerminalStarting, useTerminalTabs, useTerminalUnavailable } from './terminalState.ts';
import { TerminalTabView } from './TerminalTabView.tsx';
import { terminalUnavailableMessages } from './terminalUnavailable.ts';

const noticeClass =
	'flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground';

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
	const starting = useTerminalStarting();

	// Adopt the server's live sessions (or spawn the first one) whenever the pane is opened.
	useEffect(() => {
		if (open) void ensureTerminalReady();
	}, [open]);

	// Three exhaustive states, so the pane region is never blank and unexplained: a failure with
	// its reason, work in progress, or nothing open. The last was previously unreachable only
	// because a non-503 failure left the flag false and the tab list empty — which is the defect.
	const notice = unavailable
		? { busy: false, message: terminalUnavailableMessages[unavailable] }
		: tabs.length > 0
			? null
			: starting
				? { busy: true, message: 'Starting terminal…' }
				: { busy: false, message: 'No terminal session is open.' };

	// The stored active id may point at a tab that no longer exists — fall back to the first tab.
	const effectiveActive = tabs.some((tab) => tab.info.sessionId === activeSessionId)
		? activeSessionId
		: (tabs[0]?.info.sessionId ?? null);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TerminalPaneHeader activeSessionId={effectiveActive} tabs={tabs} />
			{notice ? (
				<div className={noticeClass}>
					<p aria-busy={notice.busy || undefined}>{notice.message}</p>
					{notice.busy ? null : (
						<button
							className="text-accent underline-offset-2 hover:underline"
							onClick={retryTerminal}
							type="button">
							Try again
						</button>
					)}
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
