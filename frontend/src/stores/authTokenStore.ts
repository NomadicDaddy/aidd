import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { traceDataMovement } from '../lib/dataMovementTrace.ts';

interface AuthTokenState {
	clearToken: () => void;
	closePrompt: () => void;
	openPrompt: () => void;
	promptOpen: boolean;
	reportUnauthorized: () => void;
	setToken: (token: string) => void;
	token: string;
}

function cleanToken(token: string): string {
	return token.trim();
}

// Storage trade-off (deliberate, defense-in-depth note — not a live exploit):
// The access token is persisted in localStorage via zustand `persist`. localStorage is
// readable by any same-origin script, so a successful XSS could exfiltrate it — but aidd
// renders no untrusted HTML (all markdown is sanitized and there is no user-content render
// path), so there is no XSS surface to exploit today. We keep localStorage because aidd is a
// local-first operator tool whose token is a long-lived shared secret the operator pastes
// once; sessionStorage would force re-entry on every tab close/reload and a short-lived WS
// ticket adds a token-exchange round-trip with no real attacker to defend against on
// localhost. If a future change introduces an untrusted-render surface, revisit this:
// move to sessionStorage and/or mint a short-lived single-use WebSocket ticket
// (see currentAuthToken usage in api/client.ts and hooks/useWebSocket.ts).
export const useAuthTokenStore = create<AuthTokenState>()(
	persist(
		(set, get) => ({
			clearToken: () => {
				set({ token: '' });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'clearToken',
					source: 'authTokenStore',
				});
			},
			closePrompt: () => set({ promptOpen: false }),
			openPrompt: () => set({ promptOpen: true }),
			promptOpen: false,
			reportUnauthorized: () => {
				if (get().promptOpen) return;
				set({ promptOpen: true });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'reportUnauthorized',
					source: 'authTokenStore',
				});
			},
			setToken: (token) => {
				set({ token: cleanToken(token) });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setToken',
					source: 'authTokenStore',
				});
			},
			token: '',
		}),
		{
			name: 'aidd-access-token',
			partialize: (state) => ({ token: state.token }),
		}
	)
);

export function currentAuthToken(): string {
	return useAuthTokenStore.getState().token;
}

export function reportUnauthorized(): void {
	useAuthTokenStore.getState().reportUnauthorized();
}
