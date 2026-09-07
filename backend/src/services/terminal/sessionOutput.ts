import type { TerminalServerFrame } from 'aidd-shared/contracts/terminal';

import type { TerminalAttachment, TerminalSession } from './sessionState.ts';

import { buildHello, HIGH_WATERMARK_CHARS, OUTPUT_FLUSH_MS } from './sessionState.ts';

export function sendSessionFrame(
	session: TerminalSession,
	attachment: TerminalAttachment,
	frame: TerminalServerFrame,
): void {
	try {
		attachment.send(frame);
	} catch {
		session.attachments.delete(attachment);
	}
}

export function broadcastSessionFrame(session: TerminalSession, frame: TerminalServerFrame): void {
	for (const attachment of session.attachments.keys()) {
		sendSessionFrame(session, attachment, frame);
	}
}

export function flushSessionOutput(session: TerminalSession): void {
	if (session.pendingOutput.length === 0) return;
	const data = session.pendingOutput;
	session.pendingOutput = '';
	for (const [attachment, flow] of session.attachments) {
		if (flow.desynced) continue;
		if (flow.unackedChars + data.length > HIGH_WATERMARK_CHARS) {
			// Too far behind — stop sending. Output keeps landing in scrollback, and the
			// ack path resyncs this attachment from there once it catches up.
			flow.desynced = true;
			continue;
		}
		flow.unackedChars += data.length;
		sendSessionFrame(session, attachment, { data, type: 'output' });
	}
}

export function queueSessionOutput(session: TerminalSession, data: string): void {
	session.mirror.write(data);
	session.pendingOutput += data;
	session.flushTimer ??= setTimeout(() => {
		session.flushTimer = null;
		flushSessionOutput(session);
	}, OUTPUT_FLUSH_MS);
}

export function resyncSessionAttachments(session: TerminalSession): void {
	for (const [attachment, flow] of session.attachments) {
		if (!flow.desynced) continue;
		flow.desynced = false;
		sendSessionFrame(session, attachment, buildHello(session));
	}
}
