import type { DetectedShell } from 'aidd-shared/contracts/terminal';

import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Locates Git Bash relative to the `git.exe` on PATH (usually `<root>\cmd\git.exe`, with bash at
 * `<root>\bin\bash.exe`), then falls back to the two default install locations.
 * @returns Absolute path to bash.exe, or null when Git Bash is not installed.
 */
function findGitBash(): null | string {
	const candidates: string[] = [];
	const git = Bun.which('git');
	if (git) candidates.push(join(dirname(dirname(git)), 'bin', 'bash.exe'));
	candidates.push(
		'C:\\Program Files\\Git\\bin\\bash.exe',
		'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
	);
	return candidates.find((path) => existsSync(path)) ?? null;
}

/**
 * WSL distros that exist as infrastructure, not user shells (Docker Desktop's backend plumbing) —
 * excluded from the picker the same way VS Code hides them.
 */
const infraDistros = new Set(['docker-desktop', 'docker-desktop-data', 'rancher-desktop']);

/**
 * Lists installed WSL distros. `wsl.exe` ships with Windows even when no distro is installed, so
 * presence on PATH proves nothing — only `wsl -l -q` (whose output is UTF-16LE, not UTF-8) tells
 * whether there is something to run. One short-lived synchronous probe, memoized with the rest of
 * detection.
 * @returns Installed distro names in WSL's order (default distro first), infra distros excluded.
 */
function listWslDistros(): string[] {
	const wsl = Bun.which('wsl');
	if (!wsl) return [];
	try {
		const result = Bun.spawnSync({
			cmd: [wsl, '-l', '-q'],
			stderr: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		if (result.exitCode !== 0) return [];
		return Buffer.from(result.stdout)
			.toString('utf16le')
			.replace(/\r/g, '')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !infraDistros.has(line.toLowerCase()));
	} catch {
		// wsl.exe vanished between which() and here, or the WSL service is broken — no entries.
		return [];
	}
}

function detectWindowsShells(): DetectedShell[] {
	const shells: DetectedShell[] = [];
	const pwsh = Bun.which('pwsh');
	if (pwsh) shells.push({ args: ['-NoLogo'], id: 'pwsh', label: 'PowerShell 7', path: pwsh });
	const powershell = Bun.which('powershell');
	if (powershell) {
		shells.push({
			args: ['-NoLogo'],
			id: 'powershell',
			label: 'Windows PowerShell',
			path: powershell,
		});
	}
	const cmd = process.env.COMSPEC ?? Bun.which('cmd');
	if (cmd) shells.push({ args: [], id: 'cmd', label: 'Command Prompt', path: cmd });
	const gitBash = findGitBash();
	// -i for an interactive prompt; no -l so the session keeps the requested cwd instead of $HOME.
	if (gitBash) shells.push({ args: ['-i'], id: 'git-bash', label: 'Git Bash', path: gitBash });
	const wsl = Bun.which('wsl');
	if (wsl) {
		// One entry per real distro; `-d` pins it so the picker choice is stable even if the
		// user changes their default distro later. wsl.exe inherits the Windows cwd (mapped to
		// /mnt/...), so sessions start in the repo root like every other shell.
		for (const distro of listWslDistros()) {
			shells.push({
				args: ['-d', distro],
				id: `wsl-${distro.toLowerCase()}`,
				label: `WSL (${distro})`,
				path: wsl,
			});
		}
	}
	return shells;
}

function detectPosixShells(): DetectedShell[] {
	const shells: DetectedShell[] = [];
	const seen = new Set<string>();
	const push = (id: string, label: string, path: null | string, args: string[] = []): void => {
		if (!path || seen.has(path)) return;
		seen.add(path);
		shells.push({ args, id, label, path });
	};
	const userShell = process.env.SHELL;
	if (userShell) push('default', basename(userShell), userShell);
	push('bash', 'bash', Bun.which('bash'));
	push('zsh', 'zsh', Bun.which('zsh'));
	push('sh', 'sh', Bun.which('sh'));
	return shells;
}

let cachedShells: DetectedShell[] | undefined;

/**
 * Detects the shells available on this host, in preference order (first entry is the default).
 * Memoized for the process lifetime — shells don't appear mid-run, and `Bun.which` walks PATH.
 * @returns The detected shells; empty when none are found (terminal picker hides itself).
 */
export function detectShells(): DetectedShell[] {
	cachedShells ??= process.platform === 'win32' ? detectWindowsShells() : detectPosixShells();
	return cachedShells;
}
