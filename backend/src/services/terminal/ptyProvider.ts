import { webLogger } from '../../logger.ts';

/**
 * Minimal PTY surface the terminal feature depends on. Mirrors the `bun-pty` IPty shape but is
 * declared here so the session manager (and its tests) never import the FFI package directly —
 * `bun-pty` stays confined to this file and can be swapped without touching callers.
 */
export interface PtyHandle {
	kill(signal?: string): void;
	onData(listener: (data: string) => void): { dispose(): void };
	onExit(listener: (event: { exitCode: number; signal?: number | string }) => void): {
		dispose(): void;
	};
	readonly pid: number;
	resize(cols: number, rows: number): void;
	write(data: string): void;
}

export interface PtySpawnOptions {
	cols: number;
	cwd: string;
	env: Record<string, string>;
	rows: number;
}

export type PtySpawn = (file: string, args: string[], options: PtySpawnOptions) => PtyHandle;

let cachedProvider: Promise<null | PtySpawn> | undefined;

/**
 * Loads the `bun-pty` FFI backend lazily and memoizes the result. A load failure (missing prebuilt
 * binary for this platform, FFI incompatibility) resolves to `null` — the terminal feature then
 * reports itself unavailable instead of crashing backend startup.
 * @returns The spawn function, or `null` when no PTY backend is usable on this host.
 */
export function loadPtyProvider(): Promise<null | PtySpawn> {
	cachedProvider ??= (async () => {
		try {
			const mod = await import('bun-pty');
			const spawn: PtySpawn = (file, args, options) =>
				mod.spawn(file, args, {
					cols: options.cols,
					cwd: options.cwd,
					env: options.env,
					name: 'xterm-256color',
					rows: options.rows,
				});
			return spawn;
		} catch (err) {
			webLogger.warn(
				{ err },
				'bun-pty failed to load; embedded terminal disabled on this host'
			);
			return null;
		}
	})();
	return cachedProvider;
}
