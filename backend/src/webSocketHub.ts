import { scrubSecretFields } from 'aidd-shared/lib/secretScrubber';

import type { WebSocketMessage } from './types.ts';

interface WebSocketPeer {
	send(data: string): void;
}

const DEFAULT_MAX_PEERS = 16;

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
		const data = JSON.stringify(scrubSecretFields(message));
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
