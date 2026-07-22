/**
 * Native Windows process-table snapshot: pid, ppid, and a start-time token, in milliseconds.
 *
 * The PowerShell/WMI probe this replaces costs 3-4s on an idle machine, and that latency is not
 * merely slow — it breaks the reaper. A backend that spawns its children and exits within a
 * second is already gone by the time the table arrives, so its row is missing, the root is never
 * verified, and nothing is ever reaped. Short-lived backends leaked silently.
 *
 * `Get-Process` is not an alternative: its `.Parent` resolves the parent as a live object, so it
 * is empty for exactly the orphans this reaper exists to find. WMI is the only PowerShell source
 * that reports a parent pid for a process whose parent is dead — hence going native.
 *
 * Toolhelp reports every process's ParentProcessId from the snapshot itself, dead parent or not.
 * The start time needs a per-pid OpenProcess, which system processes refuse; those rows keep
 * their pid/ppid and simply carry no token (the identity check degrades to ppid, as on a POSIX
 * table without `lstart`).
 *
 * Everything here is additive risk: a failure to load, or any throw, returns null and the caller
 * falls back to the PowerShell probe.
 */

import type { ProcessTableEntry } from './processTable.ts';

const TH32CS_SNAPPROCESS = 0x0000_0002;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
// CreateToolhelp32Snapshot is declared `returns: u64`, so its failure value arrives as the
// unsigned 0xFFFF...FFFF, never as -1n. Comparing against -1n never matched: the guard below was
// dead, and a failed snapshot fell through to Process32FirstW on an invalid handle (which returns
// 0, so the empty-entries branch still returned null — correct, but by accident).
const INVALID_HANDLE_VALUE = 0xffff_ffff_ffff_ffffn;

/** sizeof(PROCESSENTRY32W) on x64; the API rejects a struct that misstates its own size. */
const PROCESSENTRY32W_SIZE = 568;
const OFFSET_PROCESS_ID = 8;
const OFFSET_PARENT_PROCESS_ID = 32;

interface Kernel32 {
	CloseHandle: (handle: bigint) => number;
	CreateToolhelp32Snapshot: (flags: number, pid: number) => bigint;
	GetProcessTimes: (
		handle: bigint,
		creation: Uint8Array,
		exit: Uint8Array,
		kernel: Uint8Array,
		user: Uint8Array
	) => number;
	OpenProcess: (access: number, inherit: number, pid: number) => bigint;
	Process32FirstW: (snapshot: bigint, entry: Uint8Array) => number;
	Process32NextW: (snapshot: bigint, entry: Uint8Array) => number;
}

let kernel32: Kernel32 | null | undefined;

/** dlopen once; null means "unavailable", and the caller uses the PowerShell path. */
async function loadKernel32(): Promise<Kernel32 | null> {
	if (kernel32 !== undefined) return kernel32;
	try {
		const { dlopen, FFIType } = await import('bun:ffi');
		const lib = dlopen('kernel32.dll', {
			CloseHandle: { args: [FFIType.u64], returns: FFIType.i32 },
			CreateToolhelp32Snapshot: { args: [FFIType.u32, FFIType.u32], returns: FFIType.u64 },
			GetProcessTimes: {
				args: [FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
				returns: FFIType.i32,
			},
			OpenProcess: { args: [FFIType.u32, FFIType.i32, FFIType.u32], returns: FFIType.u64 },
			Process32FirstW: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
			Process32NextW: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
		});
		kernel32 = lib.symbols as unknown as Kernel32;
	} catch {
		kernel32 = null;
	}
	return kernel32;
}

/**
 * Process creation time as an opaque equality token (FILETIME, 100ns ticks). A recycled pid gets
 * a new creation time, so (pid, startId) survives pid reuse — which is the whole point of the
 * token in the reaper's identity check.
 */
function readStartId(api: Kernel32, pid: number): string | undefined {
	const handle = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
	if (handle === 0n) return undefined; // ACCESS_DENIED for system processes: not an error.
	try {
		const creation = new Uint8Array(8);
		const scratch = new Uint8Array(8);
		const ok = api.GetProcessTimes(
			handle,
			creation,
			scratch,
			new Uint8Array(8),
			new Uint8Array(8)
		);
		if (ok === 0) return undefined;
		const view = new DataView(creation.buffer);
		return view.getBigUint64(0, true).toString();
	} finally {
		api.CloseHandle(handle);
	}
}

export async function listProcessTableNative(): Promise<null | ProcessTableEntry[]> {
	if (process.platform !== 'win32') return null;
	const api = await loadKernel32();
	if (!api) return null;

	try {
		const snapshot = api.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
		if (snapshot === 0n || snapshot === INVALID_HANDLE_VALUE) return null;

		try {
			const entry = new Uint8Array(PROCESSENTRY32W_SIZE);
			const view = new DataView(entry.buffer);
			view.setUint32(0, PROCESSENTRY32W_SIZE, true);

			const entries: ProcessTableEntry[] = [];
			let ok = api.Process32FirstW(snapshot, entry);
			while (ok !== 0) {
				const pid = view.getUint32(OFFSET_PROCESS_ID, true);
				const ppid = view.getUint32(OFFSET_PARENT_PROCESS_ID, true);
				if (pid > 0) {
					const startId = readStartId(api, pid);
					entries.push(startId === undefined ? { pid, ppid } : { pid, ppid, startId });
				}
				view.setUint32(0, PROCESSENTRY32W_SIZE, true);
				ok = api.Process32NextW(snapshot, entry);
			}
			return entries.length > 0 ? entries : null;
		} finally {
			api.CloseHandle(snapshot);
		}
	} catch {
		return null;
	}
}
