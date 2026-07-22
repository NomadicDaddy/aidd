import type { AgentEvent } from '../backends/types.ts';
import type { StreamDelta } from './client/types.ts';

import { resultMarker } from './result-marker.ts';

/**
 * Marker-aware gate for streaming assistant text into a live console. Emits narration
 * verbatim as it arrives, but holds back a `resultMarker.length - 1` character tail so the
 * `AIDD_RESULT:` marker can never straddle two emitted chunks: once the marker appears, the
 * remaining narration is flushed, a compact `AIDD_RESULT: { … }` note is emitted (matching
 * the turn-level renderer), and the raw result JSON — often tens of KB — is suppressed.
 */
export class LiveTextGate {
	private buffer = '';
	private emitted = 0;
	private lastEmittedChar = '';
	private startedText = false;
	private suppressed = false;

	/** Append streamed text; returns the newly printable portion ('' when nothing is safe yet). */
	push(text: string): string {
		if (this.suppressed) return '';
		this.buffer += text;
		return this.emit(this.drain(resultMarker.length - 1));
	}

	/** Stream ended: release the held-back tail, newline-terminated when anything was emitted. */
	flush(): string {
		if (this.suppressed) return '';
		let out = this.drain(0);
		if (
			this.lastEmittedChar !== '' &&
			!(out === '' ? this.lastEmittedChar === '\n' : out.endsWith('\n'))
		) {
			out += '\n';
		}
		return this.emit(out);
	}

	private emit(out: string): string {
		if (out.length > 0) this.lastEmittedChar = out.slice(-1);
		return out;
	}

	private drain(holdBack: number): string {
		const markerIndex = this.buffer.indexOf(resultMarker);
		if (markerIndex !== -1) {
			this.suppressed = true;
			const narration = this.buffer.slice(this.emitted, markerIndex).replace(/\s+$/, '');
			const note = `${resultMarker} { … }\n`;
			if (narration.length > 0) return `${narration}\n${note}`;
			// No narration left to release — terminate any already-emitted text before the note.
			return this.lastEmittedChar === '' || this.lastEmittedChar === '\n'
				? note
				: `\n${note}`;
		}
		const printableEnd = this.buffer.length - holdBack;
		if (printableEnd <= this.emitted) return '';
		let out = this.buffer.slice(this.emitted, printableEnd);
		this.emitted = printableEnd;
		if (!this.startedText) {
			out = out.replace(/^\s+/, '');
			if (out.length === 0) return ''; // leading whitespace only — consumed, never emitted
			this.startedText = true;
		}
		return out;
	}
}

/**
 * Bridges the client's push-based `onDelta` stream callback into the pull-based agent-event
 * generator: deltas queue synchronously as SSE frames arrive, and `run()` yields them as
 * `assistant_delta` events while the turn's `complete()` promise is still pending — this is
 * what lets the run console show narration and reasoning progress *during* a long turn
 * instead of one silent block at the end. Contiguous same-kind deltas are coalesced per
 * drain so a token-rate stream does not become a per-token event storm. Create one pump per
 * turn: the gate state (marker suppression) is per-response.
 */
export class LiveDeltaPump {
	private notify: (() => void) | null = null;
	private readonly queue: StreamDelta[] = [];

	readonly onDelta = (delta: StreamDelta): void => {
		this.queue.push(delta);
		this.notify?.();
	};

	async *run<T>(completion: Promise<T>): AsyncGenerator<AgentEvent, T> {
		const gate = new LiveTextGate();
		let settled = false;
		// Observe settlement without swallowing the outcome — the final `await completion`
		// below re-throws a rejection into the caller (the agent loop's error handling).
		void completion.then(
			() => {
				settled = true;
				this.notify?.();
			},
			() => {
				settled = true;
				this.notify?.();
			}
		);
		while (!settled) {
			if (this.queue.length === 0) {
				await new Promise<void>((resolve) => {
					this.notify = resolve;
					if (settled || this.queue.length > 0) resolve();
				});
				this.notify = null;
				continue;
			}
			yield* this.drain(gate);
		}
		yield* this.drain(gate);
		const tail = gate.flush();
		if (tail.length > 0) yield { chunk: tail, kind: 'text', type: 'assistant_delta' };
		return await completion;
	}

	private *drain(gate: LiveTextGate): Generator<AgentEvent> {
		while (this.queue.length > 0) {
			const kind = this.queue[0]?.kind;
			let text = '';
			while (this.queue.length > 0 && this.queue[0]?.kind === kind) {
				text += this.queue.shift()?.text ?? '';
			}
			if (kind === 'text') {
				const printable = gate.push(text);
				if (printable.length > 0) {
					yield { chunk: printable, kind: 'text', type: 'assistant_delta' };
				}
			} else if (text.length > 0) {
				yield { chunk: text, kind: 'reasoning', type: 'assistant_delta' };
			}
		}
	}
}
