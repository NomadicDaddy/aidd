import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	terminalUnavailableMessages,
	type TerminalUnavailableReason,
	unavailableReasonForStatus,
} from '../../frontend/src/components/terminal/terminalUnavailable.ts';

const TERMINAL_SRC = resolve(import.meta.dir, '../../frontend/src/components/terminal');

async function terminalSource(file: string): Promise<string> {
	return await Bun.file(resolve(TERMINAL_SRC, file)).text();
}

// The defect: the pane tracked availability as one boolean set only on a 503. Every other create
// failure — backend down, proxy in the way, dropped network — raised a toast and left the pane
// rendering an empty region with no message and no control, identical to a terminal not yet opened.
describe('a terminal that could not start says why, whatever stopped it', () => {
	test('a request that reached nobody is not the same as a host without PTY support', () => {
		expect(unavailableReasonForStatus(null)).toBe('unreachable');
		expect(unavailableReasonForStatus(503)).toBe('no-pty');
		// Stated from the other side: every other answered status is a reason too, not a silent
		// fall-through to "nothing is wrong", which is what the boolean did with all of these.
		expect(unavailableReasonForStatus(500)).toBe('error');
		expect(unavailableReasonForStatus(502)).toBe('error');
		expect(unavailableReasonForStatus(404)).toBe('error');
		expect(unavailableReasonForStatus(401)).toBe('error');
	});

	test('every reason the mapper can produce has its own message on screen', () => {
		const produced = new Set<TerminalUnavailableReason>();
		for (const status of [null, 400, 401, 404, 500, 502, 503, 504]) {
			produced.add(unavailableReasonForStatus(status));
		}
		expect([...produced].sort()).toEqual(['error', 'no-pty', 'unreachable']);

		// A Record over the union cannot miss a key, but it can repeat one, and two reasons wearing
		// the same words puts the operator back where they started.
		const messages = [...produced].map((reason) => terminalUnavailableMessages[reason]);
		expect(new Set(messages).size).toBe(messages.length);
		for (const message of messages) expect(message.length).toBeGreaterThan(10);

		// The 503 wording is the one that was already on screen and already correct; it is kept
		// verbatim rather than generalized away by the other two arriving beside it.
		expect(terminalUnavailableMessages['no-pty']).toBe(
			'Terminal is unavailable on this host (PTY backend failed to load).',
		);
	});

	test('the generic create failure records a reason rather than only raising a toast', async () => {
		const sessions = await terminalSource('terminalSessions.ts');
		expect(sessions).toContain('setUnavailable(reasonFor(error));');
		expect(sessions).toContain(
			'unavailableReasonForStatus(error instanceof ApiError ? error.status : null)',
		);
		// The toast stays: it is what tells an operator looking elsewhere in the app. It is no
		// longer the only notice.
		expect(sessions).toContain('toast.error(error instanceof Error ? error.message :');
	});

	test('only a host without PTY support suppresses the automatic retry', async () => {
		const sessions = await terminalSource('terminalSessions.ts');
		// Gating the auto-create on "anything failed" would make one dropped request leave the pane
		// permanently manual, so the reason is narrowed to the one that is actually permanent.
		expect(sessions).toContain('getTabOrder().length === 0 && !isPtyUnsupported()');
		expect(sessions).not.toContain('isUnavailable()');

		const state = await terminalSource('terminalState.ts');
		expect(state).toContain("return unavailable === 'no-pty';");
	});

	test('the pane has a labelled state for starting and for nothing-open, not a blank box', async () => {
		const body = await terminalSource('TerminalPaneBody.tsx');
		expect(body).toContain('terminalUnavailableMessages[unavailable]');
		expect(body).toContain("message: 'Starting terminal…'");
		expect(body).toContain("message: 'No terminal session is open.'");
		// The retry is offered on both failure states and withheld while a start is in flight.
		expect(body).toContain('onClick={retryTerminal}');
		expect(body).toContain('aria-busy={notice.busy || undefined}');
	});
});
