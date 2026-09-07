/**
 * The pids the reaper must never kill, whatever the process table says about them.
 *
 * Every other check here asks "is this pid still the process we recorded?". This one asks a
 * different question — "would killing it take us down?" — and it is the only check that cannot be
 * defeated by a stale ppid, because it never consults one.
 *
 * It exists because that is exactly how runs were dying. A detached run is a chain: launch shell ->
 * relauncher -> CLI. The launch shell exits within seconds, leaving the relauncher permanently
 * orphaned onto a dead pid number that Windows keeps reporting and the OS is free to reissue. Once
 * the reaper tracked whatever inherited that number, the run's own tree enumerated as its children
 * and teardown killed the process doing the work — mid-iteration, with no crash and no log line.
 *
 * So: walk up from this process and refuse to kill anything on that chain, plus whatever the
 * caller names (the CLI knows its relauncher directly, and passes it in so the guard holds even
 * when the ancestry probe returns nothing). Over-protecting costs a leaked child; under-protecting
 * costs the run.
 */

import type { ProcessTableEntry } from './processTable.ts';

export interface ProtectionOptions {
	/** Pids the caller knows are load-bearing — its own launcher, typically. */
	extraPids?: readonly number[];
	readAncestry: (pid: number, maxHops: number) => Promise<ProcessTableEntry[]>;
	/** Injectable for tests. Defaults to this process. */
	selfPid?: number;
}

/** How far up the tree to protect. The launch chain is three deep; the rest is headroom. */
const maxAncestorHops = 8;

/**
 * This process, its ancestors, and any pid the caller nominated.
 *
 * The ancestry walk follows ppids and so can itself run onto a reissued number and protect a
 * stranger. That is the acceptable direction of the error: a protected stranger is at worst a
 * missed reap, while an unprotected ancestor is a killed run.
 */
export async function resolveProtectedPids(options: ProtectionOptions): Promise<Set<number>> {
	const selfPid = options.selfPid ?? process.pid;
	const protectedPids = new Set<number>([selfPid]);
	for (const pid of options.extraPids ?? []) {
		if (pid > 1) protectedPids.add(pid);
	}

	try {
		const chain = await options.readAncestry(selfPid, maxAncestorHops);
		for (const entry of chain) {
			if (entry.pid > 1) protectedPids.add(entry.pid);
			if (entry.ppid > 1) protectedPids.add(entry.ppid);
		}
	} catch {
		// A failed walk leaves the caller-supplied pids in place, which is the point of taking them.
	}
	return protectedPids;
}
