import { describe, expect, it } from 'bun:test';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

function makePeer(sink: string[]) {
	return { send: (data: string) => sink.push(data) };
}

describe('WebSocketHub', () => {
	it('rejects connections past maxPeers cap', () => {
		const hub = new WebSocketHub({ maxPeers: 2 });
		const sink: string[] = [];
		expect(hub.add(makePeer(sink))).toBe(true);
		expect(hub.add(makePeer(sink))).toBe(true);
		expect(hub.add(makePeer(sink))).toBe(false);
		expect(hub.peerCount).toBe(2);
	});

	it('defaults cap to 16', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		for (let i = 0; i < 16; i += 1) {
			expect(hub.add(makePeer(sink))).toBe(true);
		}
		expect(hub.add(makePeer(sink))).toBe(false);
	});

	it('scrubs sk-, Bearer, and Authorization secrets from run_output chunks', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		hub.add(makePeer(sink));
		hub.broadcast({
			payload: {
				chunk: 'token=sk-ABCDEFGHIJKLMNOP and Bearer abc.def-ghi; Authorization: Basic xyz',
				stream: 'stdout',
			},
			runId: 'run_1',
			type: 'run_output',
		});
		expect(sink).toHaveLength(1);
		const parsed = JSON.parse(sink[0] ?? '');
		expect(parsed.payload.chunk).not.toContain('sk-ABCDEFGHIJKLMNOP');
		expect(parsed.payload.chunk).not.toContain('Bearer abc.def-ghi');
		expect(parsed.payload.chunk).not.toContain('Authorization: Basic xyz');
		expect(parsed.payload.chunk).toContain('[REDACTED]');
		expect(parsed.runId).toBe('run_1');
	});

	it('passes through non-run_output messages without secrets unchanged', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		hub.add(makePeer(sink));
		hub.broadcast({ payload: { status: 'running' }, runId: 'run_1', type: 'run_status' });
		expect(JSON.parse(sink[0] ?? '')).toEqual({
			payload: { status: 'running' },
			runId: 'run_1',
			type: 'run_status',
		});
	});

	it('scrubs secrets from run_status error fields (BREAK-THE-ASSUMPTION)', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		hub.add(makePeer(sink));
		hub.broadcast({
			payload: {
				error: 'provider returned 401: token=sk-ABCDEFGHIJKLMNOP is invalid',
				status: 'failed',
			},
			runId: 'run_1',
			type: 'run_status',
		});
		expect(sink).toHaveLength(1);
		const parsed = JSON.parse(sink[0] ?? '');
		expect(parsed.payload.error).not.toContain('sk-ABCDEFGHIJKLMNOP');
		expect(parsed.payload.error).toContain('[REDACTED]');
		expect(parsed.type).toBe('run_status');
	});

	it('scrubs secrets from director_cycle and ack payloads', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		hub.add(makePeer(sink));
		hub.broadcast({
			payload: {
				cycleId: 'c1',
				directAiMeta: {
					model: 'Bearer leaked-token-here-1234567890',
					provider: 'openai',
					reasoningEffort: 'high',
				},
				stage: 'done',
				status: 'completed',
			},
			type: 'director_cycle',
		});
		const parsed = JSON.parse(sink[0] ?? '');
		expect(parsed.payload.directAiMeta.model).not.toContain('leaked-token');
		expect(parsed.payload.directAiMeta.model).toContain('[REDACTED]');
		expect(parsed.payload.directAiMeta.provider).toBe('openai');
		expect(parsed.payload.directAiMeta.reasoningEffort).toBe('high');

		sink.length = 0;
		hub.broadcast({
			payload: 'Authorization: sk-ABCDEFGHIJKLMNOP',
			type: 'ack',
		});
		const ackParsed = JSON.parse(sink[0] ?? '');
		expect(ackParsed.payload).not.toContain('sk-ABCDEFGHIJKLMNOP');
		expect(ackParsed.payload).toContain('[REDACTED]');
	});

	it('does not mutate the input message', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		hub.add(makePeer(sink));
		const payload = { chunk: 'pre sk-ABCDEFGHIJKLMNOP post', stream: 'stdout' as const };
		hub.broadcast({ payload, runId: 'run_1', type: 'run_output' });
		expect(payload.chunk).toBe('pre sk-ABCDEFGHIJKLMNOP post');
	});

	it('removes by stable id even when peer wrapper objects differ between add and remove', () => {
		const hub = new WebSocketHub();
		const sink: string[] = [];
		for (let i = 0; i < 20; i += 1) {
			const id = `peer-${i}`;
			expect(hub.add(makePeer(sink), id)).toBe(true);
			hub.remove(id);
		}
		expect(hub.peerCount).toBe(0);
	});

	it('removes peers and broadcasts only to remaining', () => {
		const hub = new WebSocketHub();
		const a: string[] = [];
		const b: string[] = [];
		const peerA = makePeer(a);
		const peerB = makePeer(b);
		hub.add(peerA);
		hub.add(peerB);
		hub.remove(peerA);
		hub.broadcast({ payload: { status: 'running' }, runId: 'r', type: 'run_status' });
		expect(a).toHaveLength(0);
		expect(b).toHaveLength(1);
	});
});
