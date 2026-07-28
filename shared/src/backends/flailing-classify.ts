import type { AgentEvent } from './types.ts';

import {
	bashToolPattern,
	commandFromArgs,
	cwdFromArgs,
} from '../orchestrator/details/tool-args.ts';

// Classifies a tool call into the normalized signature the flailing detector streaks on, plus
// whether it is a server-diagnostic/lifecycle shell command. Split out of flailing.ts to keep
// the detector's state machine readable next to the shell-parsing it depends on.

// Program tokens that, when a shell command leads with them and changes no files, indicate the agent
// is probing for / starting / killing a server rather than doing productive work.
const diagnosticVerbs: ReadonlySet<string> = new Set([
	'curl',
	'get-nettcpconnection',
	'get-process',
	'kill',
	'lsof',
	'nc',
	'ncat',
	'netstat',
	'ping',
	'pkill',
	'ps',
	'sleep',
	'ss',
	'start-process',
	'taskkill',
	'tasklist',
	'telnet',
	'timeout',
	'wget',
	'where',
	'whereis',
	'which',
]);

const lifecycleRunPattern =
	/\b(?:bun|bunx|npm|pnpm|yarn)(?:\.exe)?\s+run\s+(?:start|start:web|stop|dev|smoke:dev|smoke:preview)\b/i;

// Shells whose real command lives in a quoted argument. Windows backends wrap every command as
// `"C:\Program Files\PowerShell\7\pwsh.exe" -Command '<real command>'`, so classifying on the
// outer token alone hides every diagnostic verb behind the wrapper.
const shellWrappers: ReadonlySet<string> = new Set([
	'bash',
	'cmd',
	'powershell',
	'pwsh',
	'sh',
	'zsh',
]);

const envAssignmentPattern = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Split on whitespace while honoring quotes, so a quoted program path stays one token and a quoted
// inner script survives as one argument instead of shattering across the wrapper's flags.
function tokenizeCommand(command: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let quote: '"' | "'" | undefined;
	for (const character of command) {
		if (quote !== undefined) {
			if (character === quote) quote = undefined;
			else current += character;
		} else if (character === '"' || character === "'") {
			quote = character;
		} else if (/\s/.test(character)) {
			if (current.length > 0) tokens.push(current);
			current = '';
		} else {
			current += character;
		}
	}
	if (current.length > 0) tokens.push(current);
	// Drop leading `sudo` and `FOO=bar` env assignments. Leading-only: an inner script argument
	// routinely contains `=` and must not be discarded as an assignment.
	let start = 0;
	while (
		start < tokens.length &&
		(tokens[start] === 'sudo' || envAssignmentPattern.test(tokens[start]!))
	) {
		start++;
	}
	return tokens.slice(start);
}

// `-Command`, `-lc` and cmd.exe's `/c` are wrapper switches to skip past; `/usr/bin/curl` is not.
function isWrapperSwitch(token: string): boolean {
	return token.startsWith('-') || /^\/[A-Za-z]$/.test(token);
}

function programName(token: string): string {
	const base = token.split(/[\\/]/).pop() ?? token;
	return base.replace(/\.(?:exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

function leadingProgram(command: string): string {
	const trimmed = command.trim();
	if (lifecycleRunPattern.test(trimmed)) return 'lifecycle';
	let tokens = tokenizeCommand(trimmed);
	// Unwrap at most one nested shell wrapper, so `pwsh -Command 'curl ...'` classifies on `curl`.
	for (let depth = 0; depth < 2; depth++) {
		const program = tokens.length > 0 ? programName(tokens[0]!) : '';
		if (!shellWrappers.has(program)) return program;
		const inner = tokens.slice(1).find((token) => !isWrapperSwitch(token));
		if (inner === undefined) return program;
		tokens = tokenizeCommand(inner);
	}
	return tokens.length > 0 ? programName(tokens[0]!) : '';
}

// Compare working directories the way the filesystem these backends run on does: separator- and
// case-insensitive, with any trailing separator dropped.
function normalizeCwd(cwd: string | undefined): string | undefined {
	if (cwd === undefined) return undefined;
	const normalized = cwd
		.trim()
		.replace(/[\\/]+/g, '/')
		.replace(/\/+$/, '')
		.toLowerCase();
	return normalized.length > 0 ? normalized : undefined;
}

export interface WindowEntry {
	isDiagnostic: boolean;
	signature: string;
}

export function entryForToolCall(event: Extract<AgentEvent, { type: 'tool_call' }>): WindowEntry {
	if (bashToolPattern.test(event.tool)) {
		const command = commandFromArgs(event.args) ?? '';
		const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase();
		const program = leadingProgram(command);
		// The same command run against a different repository is not a repeat — a fleet sweep
		// issues one identical `git status` per checkout and read as 11 replays of one dead action.
		// Only backends that report a per-call working directory can be told apart;
		// the rest keep the bare command signature they have always had.
		const cwd = normalizeCwd(cwdFromArgs(event.args));
		return {
			isDiagnostic: program === 'lifecycle' || diagnosticVerbs.has(program),
			signature: cwd === undefined ? `bash:${normalized}` : `bash:${cwd}|${normalized}`,
		};
	}
	let argsKey: string;
	try {
		argsKey = JSON.stringify(event.args)?.slice(0, 200) ?? '';
	} catch {
		argsKey = '';
	}
	return { isDiagnostic: false, signature: `${event.tool.toLowerCase()}:${argsKey}` };
}

// FNV-1a over the tool result, so a streak can be compared by content without retaining it.
export function digestResult(event: Extract<AgentEvent, { type: 'tool_result' }>): string {
	let text: string;
	if (typeof event.result === 'string') {
		text = event.result;
	} else {
		try {
			text = JSON.stringify(event.result) ?? '';
		} catch {
			text = '';
		}
	}
	let hash = 0x811c9dc5;
	const trimmed = text.trim();
	for (let index = 0; index < trimmed.length; index++) {
		hash ^= trimmed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${event.exitCode ?? ''}:${(hash >>> 0).toString(36)}`;
}
