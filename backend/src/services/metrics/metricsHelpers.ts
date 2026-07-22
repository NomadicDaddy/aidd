import { statfsSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';

import { webLogger } from '../../logger.ts';

// ---------------------------------------------------------------------------
// CPU measurement (delta-based)
// ---------------------------------------------------------------------------

interface CpuSnapshot {
	idle: number;
	tick: number;
	timestamp: number;
}

let lastCpuSnapshot: CpuSnapshot | null = null;
let cachedCpuUsage = 0;

/** Minimum time (ms) between CPU readings for an accurate delta. */
const CPU_MIN_DELTA_MS = 1000;

/**
 * CPU usage as a percentage (0-100), computed from the delta between successive readings of the
 * cumulative per-core tick counters. The first call seeds the baseline and returns 0; subsequent
 * calls at least CPU_MIN_DELTA_MS apart recompute, otherwise the cached value is returned.
 * @returns CPU usage percentage.
 */
export function getCpuUsage(): number {
	const cores = cpus();
	let totalIdle = 0;
	let totalTick = 0;

	for (const core of cores) {
		const { idle, irq, nice, sys, user } = core.times;
		totalTick += user + nice + sys + idle + irq;
		totalIdle += idle;
	}

	const now = Date.now();

	if (lastCpuSnapshot) {
		const deltaTime = now - lastCpuSnapshot.timestamp;
		if (deltaTime >= CPU_MIN_DELTA_MS) {
			const deltaTick = totalTick - lastCpuSnapshot.tick;
			const deltaIdle = totalIdle - lastCpuSnapshot.idle;
			if (deltaTick > 0) {
				cachedCpuUsage = Math.round(((deltaTick - deltaIdle) / deltaTick) * 1000) / 10;
			}
			lastCpuSnapshot = { idle: totalIdle, tick: totalTick, timestamp: now };
		}
		return cachedCpuUsage;
	}

	lastCpuSnapshot = { idle: totalIdle, tick: totalTick, timestamp: now };
	return 0;
}

/**
 * OS memory usage as a percentage (0-100) of total physical memory.
 * @returns Memory usage percentage.
 */
export function getMemoryUsagePercent(): number {
	const total = totalmem();
	const free = freemem();
	if (total <= 0) return 0;
	const used = total - free;
	return Math.min(Math.round((used / total) * 1000) / 10, 100);
}

// ---------------------------------------------------------------------------
// Disk usage
// ---------------------------------------------------------------------------

/**
 * Disk usage percentage (0-100) for the volume holding the given data directory, or null when the
 * platform/filesystem does not support statfs. Guarded because statfsSync can throw on some
 * Windows volume types.
 *
 * @param dataDir - Absolute path to the panel's data directory.
 * @returns Disk usage percentage or null if unsupported.
 */
export function getDiskUsagePercent(dataDir: string): null | number {
	try {
		const stats = statfsSync(dataDir);
		const total = stats.blocks * stats.bsize;
		const free = stats.bfree * stats.bsize;
		if (total === 0) return null;
		return Math.round(((total - free) / total) * 1000) / 10;
	} catch (err) {
		webLogger.warn({ dataDir, err }, 'failed to read disk usage — statfsSync threw');
		return null;
	}
}

// ---------------------------------------------------------------------------
// Event loop latency
// ---------------------------------------------------------------------------

let lastEventLoopLatencyMs: null | number = null;
let eventLoopTimerHandle: null | ReturnType<typeof setTimeout> = null;

/**
 * Begin sampling event-loop latency: schedule a timer for INTERVAL_MS and record how much later
 * than scheduled the callback actually fired — the overshoot is the latency the loop is adding.
 * Reschedules itself; call stopEventLoopLatencyTimer to end the chain.
 */
export function measureEventLoopLatency(): void {
	const INTERVAL_MS = 1000;
	const scheduled = performance.now();
	eventLoopTimerHandle = setTimeout(() => {
		lastEventLoopLatencyMs =
			Math.round((performance.now() - scheduled - INTERVAL_MS) * 100) / 100;
		measureEventLoopLatency();
	}, INTERVAL_MS);
	// Don't keep the process alive solely for metrics sampling.
	eventLoopTimerHandle.unref?.();
}

/** Stop the event-loop latency sampling chain. */
export function stopEventLoopLatencyTimer(): void {
	if (eventLoopTimerHandle) {
		clearTimeout(eventLoopTimerHandle);
		eventLoopTimerHandle = null;
	}
}

/**
 * Last measured event-loop latency in ms, or null if not yet sampled.
 * @returns The latency in ms or null.
 */
export function getEventLoopLatency(): null | number {
	return lastEventLoopLatencyMs;
}
