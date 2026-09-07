/**
 * Why the pane has no terminal, when it has none. `no-pty` is the backend answering that this host
 * cannot run one; the other two are the backend not answering, or answering with something else.
 *
 * These were one boolean, set only on a 503. Every other create failure — the web server down, a
 * proxy in the way, a dropped network — raised a toast and left the pane rendering an empty region
 * with no message and no way back, indistinguishable from a terminal that had simply not opened yet.
 */
export type TerminalUnavailableReason = 'error' | 'no-pty' | 'unreachable';

/**
 * The reason a failed create maps to. It lives in its own module, with no imports, so the pane's
 * decision can be tested without the API client, sonner, zustand and `window` coming with it.
 *
 * A null status is a request that never reached a responding server, which is the case the boolean
 * could not express: `no-pty` is a host that answered, and telling an operator the PTY backend
 * failed to load when the backend is merely unreachable sends them to the wrong problem.
 */
export function unavailableReasonForStatus(status: null | number): TerminalUnavailableReason {
	if (status === null) return 'unreachable';
	return status === 503 ? 'no-pty' : 'error';
}

/** What each reason says on screen. A Record over the union, so a new reason cannot render blank. */
export const terminalUnavailableMessages: Record<TerminalUnavailableReason, string> = {
	error: 'Could not start a terminal session.',
	'no-pty': 'Terminal is unavailable on this host (PTY backend failed to load).',
	unreachable: 'The terminal service could not be reached.',
};
