/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';

import type { RunOutputState, RunStatus } from '../api/types.ts';

import { capLiveBuffer, readChunk, readStatus, suffixPrefixOverlap } from './liveOutputBuffer.ts';
import { createFlushScheduler, type FlushScheduler } from './liveOutputFlusher.ts';
import { useRunOutput } from './useRuns.ts';
import {
	useWebSocketReconnect,
	useWebSocketSubscribe,
	type SocketMessage,
} from './useWebSocket.ts';

const EMPTY_SELECTED_RUN_OUTPUT_POLL_MS = 2_000;

// Live run output: WebSocket run_output chunks are the steady-state source, appended in
// receipt order (the backend serializes file write + broadcast, so receipt order is
// authoritative). The backfill query is adopted only when its full-log snapshot is at
// least as long as the live buffer, which makes reconnect/terminal resync de-duplicating:
// the whole-file snapshot replaces (never concatenates), so chunks already streamed are
// not doubled, while chunks missed during a disconnect are recovered.
export interface RunLiveOutput {
	isLoading: boolean;
	isStreaming: boolean;
	reason: null | string;
	state: null | RunOutputState;
	text: string;
	// Full transcript size on disk and whether the backfill snapshot was capped to its tail. The
	// live WebSocket stream is uncapped, so for an actively streaming run `text` may already exceed
	// `totalBytes` (a fetch-time snapshot); the console uses max(text.length, totalBytes) for display.
	totalBytes: null | number;
	truncated: boolean;
}

export function useRunLiveOutput(
	id: string | undefined,
	status: RunStatus | undefined
): RunLiveOutput {
	const query = useRunOutput(id);
	const [text, setText] = useState('');
	const [isStreaming, setIsStreaming] = useState(false);
	const idRef = useRef(id);
	const statusRef = useRef(status);
	const textRef = useRef('');
	// Set once a terminal run_status is seen for the active run. The backend flushes the final
	// run_output before broadcasting terminal status, but a reconnect/resync can still deliver a
	// late chunk afterward — this guard lets that chunk's text through while preventing it from
	// flipping the console back into the "streaming" state after the run has ended.
	const terminalRef = useRef(false);
	// Length of the most recently adopted query snapshot. After adoption, WebSocket chunks may
	// overlap with snapshot content (the HTTP read and the tail-watcher broadcast can cover the
	// same file bytes). The watermark enables suffix-prefix deduplication so overlapping chunks
	// are trimmed or skipped instead of appended verbatim (which would double the transcript).
	const snapshotWatermarkRef = useRef(0);
	const refetchRef = useRef(query.refetch);
	refetchRef.current = query.refetch;
	statusRef.current = status;

	// Coalesce rapid run_output chunks into one flush per frame window. A fast backend can
	// emit dozens of chunks per second; a setText per chunk re-renders the (ever-growing)
	// transcript each time and starves the main thread. Bytes are appended to textRef synchronously
	// (so nothing is lost or reordered), and the buffer is flushed to React state at most once per
	// window. The scheduler races requestAnimationFrame against a setTimeout fallback so a hidden
	// tab (where rAF is paused) still repaints — an rAF-only coalescer froze the console until a
	// non-rAF path repainted (see liveOutputFlusher). Created once; the flush reads live refs.
	const flushSchedulerRef = useRef<FlushScheduler | null>(null);
	if (flushSchedulerRef.current === null) {
		flushSchedulerRef.current = createFlushScheduler(() => {
			setText(textRef.current);
			if (!terminalRef.current) setIsStreaming(true);
		});
	}
	const scheduleFlush = () => flushSchedulerRef.current?.schedule();
	const cancelFlush = () => flushSchedulerRef.current?.cancel();

	// Repaint immediately when the tab becomes visible again. While hidden, rAF is paused and the
	// timeout fallback is throttled to ~1s, so buffered chunks can lag; flushing on visibility makes
	// returning to the tab show the latest output at once instead of after the next throttled tick.
	useEffect(() => {
		if (typeof document === 'undefined') return undefined;
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') return;
			cancelFlush();
			setText(textRef.current);
			if (!terminalRef.current && textRef.current.length > 0) setIsStreaming(true);
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
		// cancelFlush/setText/refs are stable; register once for the hook's lifetime.
	}, []);

	useEffect(() => {
		idRef.current = id;
		textRef.current = '';
		terminalRef.current = statusRef.current !== undefined && statusRef.current !== 'running';
		snapshotWatermarkRef.current = 0;
		cancelFlush();
		setText('');
		setIsStreaming(false);
		// cancelFlush only touches refs/state setters, so it needs no dependency entry here.
	}, [id]);

	// Drop any pending frame on unmount so a flush never fires into an unmounted component.
	useEffect(() => cancelFlush, []);

	useEffect(() => {
		const snapshot = query.data;
		if (snapshot === undefined) return;
		if (snapshot.output.length >= textRef.current.length) {
			textRef.current = capLiveBuffer(snapshot.output);
			// Post-cap length (not the raw snapshot length) so the overlap-dedup gate stays consistent.
			snapshotWatermarkRef.current = textRef.current.length;
			setText(textRef.current);
		}
	}, [query.data]);

	useEffect(() => {
		if (!id) return;
		if (status !== undefined && status !== 'running' && !terminalRef.current) {
			terminalRef.current = true;
			cancelFlush();
			setText(textRef.current);
			setIsStreaming(false);
			void refetchRef.current();
		}
	}, [id, status]);

	useEffect(() => {
		if (!id || status !== 'running' || text.length > 0) return undefined;
		const timer = setInterval(() => {
			if (textRef.current.length === 0) void refetchRef.current();
		}, EMPTY_SELECTED_RUN_OUTPUT_POLL_MS);
		return () => clearInterval(timer);
	}, [id, status, text]);

	const handleMessage = (message: SocketMessage) => {
		const activeId = idRef.current;
		if (!activeId || message.runId !== activeId) return;
		if (message.type === 'run_output') {
			const chunk = readChunk(message.payload);
			if (chunk === null) return;
			// After adopting a query snapshot, in-flight WebSocket chunks may overlap with
			// content the snapshot already contains (the HTTP read races the tail-watcher
			// broadcast). Without deduplication the chunk is appended verbatim, doubling that
			// portion of the transcript. The watermark holds the adopted snapshot length; while
			// textRef hasn't grown past it organically, we check for suffix-prefix overlap
			// between textRef and the chunk and trim or skip accordingly.
			const watermark = snapshotWatermarkRef.current;
			if (watermark > 0 && textRef.current.length <= watermark) {
				if (textRef.current.endsWith(chunk)) {
					// Entire chunk duplicates the tail of the adopted snapshot — skip.
					return;
				}
				// Partial overlap: find how many chars at the end of textRef match the
				// start of chunk (the file is append-only, so overlap is always a suffix
				// of the existing text matching a prefix of the incoming chunk).
				const overlap = suffixPrefixOverlap(textRef.current, chunk);
				if (overlap >= chunk.length) return; // entirely contained — skip
				snapshotWatermarkRef.current = 0;
				textRef.current = capLiveBuffer(
					textRef.current + (overlap > 0 ? chunk.slice(overlap) : chunk)
				);
				scheduleFlush();
				return;
			}
			snapshotWatermarkRef.current = 0;
			textRef.current = capLiveBuffer(textRef.current + chunk);
			scheduleFlush();
			return;
		}
		if (message.type === 'run_status') {
			const status = readStatus(message.payload);
			if (status !== null && status !== 'running') {
				// Mark terminal first so any late-arriving chunk's flush cannot re-enter streaming,
				// then flush the buffered tail synchronously so the final chunk is never dropped and
				// drop any pending frame.
				terminalRef.current = true;
				cancelFlush();
				setText(textRef.current);
				setIsStreaming(false);
				void refetchRef.current();
			}
		}
	};
	useWebSocketSubscribe(handleMessage);

	const handleReconnect = () => {
		if (idRef.current) void refetchRef.current();
	};
	useWebSocketReconnect(handleReconnect);

	const snapshot = query.data;
	return {
		isLoading: id !== undefined && query.isLoading,
		isStreaming,
		reason: snapshot?.reason ?? null,
		state: snapshot?.state ?? null,
		text,
		totalBytes: snapshot?.totalBytes ?? null,
		truncated: snapshot?.truncated ?? false,
	};
}
