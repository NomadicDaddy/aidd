import type { DetectedShell, TerminalSessionInfo } from 'aidd-shared/contracts/terminal';

import { apiGet, apiSend } from './client.ts';

export function fetchTerminalShells(): Promise<{ shells: DetectedShell[] }> {
	return apiGet<{ shells: DetectedShell[] }>('/api/v1/terminal/shells');
}

/** Lists the live PTY sessions — the source of truth for the pane's tabs on (re)load. */
export function fetchTerminalSessions(): Promise<{ sessions: TerminalSessionInfo[] }> {
	return apiGet<{ sessions: TerminalSessionInfo[] }>('/api/v1/terminal/sessions');
}

/** Spawns a new session; omitted fields fall back to the server defaults (first shell, root cwd). */
export function createTerminalSession(
	options: { cwd?: string; shellId?: string } = {},
): Promise<TerminalSessionInfo> {
	const body: Record<string, string> = {};
	if (options.cwd) body.cwd = options.cwd;
	if (options.shellId) body.shellId = options.shellId;
	return apiSend<TerminalSessionInfo>('/api/v1/terminal/sessions', 'POST', body);
}

export function killTerminalSession(sessionId: string): Promise<{ ok: boolean }> {
	return apiSend<{ ok: boolean }>(
		`/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}`,
		'DELETE',
	);
}
