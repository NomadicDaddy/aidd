import type { WebSocketMessage } from './types.ts';

import { scrubSecrets } from './services/secretScrubber.ts';

interface WebSocketPeer {
	send(data: string): void;
}

const DEFAULT_MAX_PEERS = 16;

// Recursively scrub every string value in a frame, returning a fresh structure (the input is
// never mutated). Scrubbing values in isolation — rather than the serialized JSON string —
// keeps the output structurally valid: a greedy rule like /Authorization:\s*\S+/ would
// otherwise swallow the closing quote and the rest of the frame when a secret sits at the end
// of a string value, corrupting the JSON. Keys are field names, never secrets, so they pass
// through untouched.
function deepScrubValue(value: unknown): unknown {
	if (typeof value === 'string') return scrubSecrets(value);
	if (Array.isArray(value)) return value.map(deepScrubValue);
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) out[key] = deepScrubValue(nested);
		return out;
	}
	return value;
}

export class WebSocketHub {
	private readonly maxPeers: number;
	private readonly peers = new Map<string, WebSocketPeer>();
	private nextAnonymousId = 0;

	constructor(options?: { maxPeers?: number }) {
		this.maxPeers = options?.maxPeers ?? DEFAULT_MAX_PEERS;
	}

	add(peer: WebSocketPeer, id?: string): boolean {
		if (this.peers.size >= this.maxPeers) return false;
		const key = id ?? `anon-${this.nextAnonymousId++}`;
		this.peers.set(key, peer);
		return true;
	}

	broadcast(message: WebSocketMessage): void {
		// Deep-scrub the frame before sending so a secret embedded in ANY field of ANY frame
		// type (run_output chunk, run_status error, director cycle metadata, ack payload,
		// etc.) is caught before reaching a connected client. Scrubbing per-value (then
		// serializing) instead of over the serialized string guarantees the emitted JSON
		// stays well-formed even when a redaction rule matches at a value boundary.
		const data = JSON.stringify(deepScrubValue(message));
		for (const [key, peer] of this.peers) {
			// Best-effort broadcast: a failed send (closed/broken socket) is non-fatal. We drop the
			// dead peer and continue iterating so one bad peer cannot block delivery to the rest.
			// Nothing is logged here by design — a disconnecting client is expected, not an error.
			try {
				peer.send(data);
			} catch {
				this.peers.delete(key);
			}
		}
	}

	remove(idOrPeer: string | WebSocketPeer): void {
		if (typeof idOrPeer === 'string') {
			this.peers.delete(idOrPeer);
			return;
		}
		for (const [key, peer] of this.peers) {
			if (peer === idOrPeer) {
				this.peers.delete(key);
				return;
			}
		}
	}

	get peerCount(): number {
		return this.peers.size;
	}
}
