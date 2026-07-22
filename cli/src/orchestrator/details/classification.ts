import type { FinalCheckStatus, FinalCheckSummary, IterationErrorType } from './types.ts';

export function classifyErrorText(text: string): IterationErrorType | undefined {
	if (commandOutputPassed(text)) return undefined;
	if (
		/\berror TS\d{3,5}\b|TypeScript (?:compilation )?(?:failed|error)|typecheck failed/i.test(
			text
		)
	) {
		return 'typescript';
	}
	if (
		/\b(?:eslint|biome|lint(?:ing)?) (?:failed|error|found \d+ problems?)\b|✖ \d+ problems? \(\d+ errors?/i.test(
			text
		)
	) {
		return 'lint';
	}
	if (
		/\bbuild (?:failed|error)|(?:webpack|rollup|vite|bun) build[^\n]*(?:failed|error)/i.test(
			text
		)
	) {
		return 'build';
	}
	if (/timeout|timed out/i.test(text)) return 'timeout';
	if (/EACCES|permission denied|EPERM/i.test(text)) return 'permission';
	return undefined;
}

const passedExitPattern =
	/(?:(?:^|\n)\s*(?:Exit code|\[exit code):?\s*0\]?|\bexited with code 0\b|\(exit\s+0\)|\bexit status\s+0\b)/i;
const failedExitPattern =
	/(?:(?:^|\n)\s*(?:Exit code|\[exit code):?\s*(?!0\b)\d+\]?|\bexited with code\s+(?!0\b)\d+\b|\(exit\s+(?!0\b)\d+\)|\bexit status\s+(?!0\b)\d+\b)/i;
const failMarkerPattern = /(?:^|\n)\s*\[FAIL\]\b/;
const passMarkerPattern = /(?:^|\n)\s*\[PASS\]\b/;

function commandOutputPassed(text: string): boolean {
	if (failMarkerPattern.test(text)) return false;
	if (passedExitPattern.test(text)) return true;
	return passMarkerPattern.test(text) && !failedExitPattern.test(text);
}

export function commandOutputFailed(text: string): boolean {
	if (failedExitPattern.test(text)) return true;
	return failMarkerPattern.test(text);
}

/** Whether the output carries a definitive pass/fail verdict for the command that produced it.
 * Backends that surface no exit code and no [PASS]/[FAIL] marker leave failure undetectable, which
 * is a different state from "the command demonstrably succeeded" — see gateCommands. */
export function commandStatusKnown(text: string): boolean {
	return commandOutputPassed(text) || commandOutputFailed(text);
}

export function classifyFinalCheckCommand(command: string): keyof FinalCheckSummary | undefined {
	if (/\b(?:bun|npm|pnpm|yarn)\s+run\s+smoke:qc\b/i.test(command)) return 'smokeQc';
	if (/\b(?:bun|npm|pnpm|yarn)\s+run\s+typecheck\b|\btsc\b/i.test(command)) {
		return 'typecheck';
	}
	if (
		/\b(?:bun|npm|pnpm|yarn)\s+run\s+(?:build|build:frontend)\b|\bvite build\b/i.test(command)
	) {
		return 'build';
	}
	if (/\b(?:bun|npm|pnpm|yarn)\s+run\s+format\b|\bprettier\b/i.test(command)) {
		return 'format';
	}
	return undefined;
}

export function finalCheckStatusFromOutput(text: string): FinalCheckStatus | undefined {
	if (commandOutputPassed(text)) return 'passed';
	if (commandOutputFailed(text)) return 'failed';
	return undefined;
}

export function commandMatchesErrorType(command: string, type: IterationErrorType): boolean {
	if (type === 'typescript') return /\b(?:typecheck|type-check|tsc)\b/i.test(command);
	if (type === 'lint') return /\b(?:lint|eslint|biome)\b/i.test(command);
	if (type === 'build') return /\b(?:build|webpack|rollup|vite)\b/i.test(command);
	return type === 'permission' || type === 'timeout';
}

const maxProviderMessageUnwrapDepth = 5;

export function providerErrorText(meta: unknown, depth = 0): string | undefined {
	if (typeof meta === 'string') return unwrapProviderMessage(meta, depth);
	if (typeof meta !== 'object' || meta === null) return undefined;
	const message = firstProviderString(meta, [
		['result'],
		['error', 'message'],
		['message'],
		['stderr'],
	]);
	if (message) return unwrapProviderMessage(message, depth);
	try {
		return JSON.stringify(meta);
	} catch {
		return undefined;
	}
}

// Backends (e.g. codex) nest the human-readable message inside JSON-encoded
// strings, sometimes several layers deep: {message: '{"error":{"message":"..."}}'}.
function unwrapProviderMessage(text: string, depth: number): string {
	const trimmed = text.trim();
	if (depth >= maxProviderMessageUnwrapDepth) return trimmed;
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
	try {
		const inner = providerErrorText(JSON.parse(trimmed), depth + 1);
		return inner ?? trimmed;
	} catch {
		return trimmed;
	}
}

// The stream parsers emit a generic {exitCode, stderr} provider error when the
// backend process exits non-zero; it carries no diagnosis of its own and must
// not displace a real provider error seen earlier in the same iteration.
export function isProviderExitFallbackMeta(meta: unknown): boolean {
	if (typeof meta !== 'object' || meta === null) return false;
	const record = meta as Record<string, unknown>;
	if (!('exitCode' in record)) return false;
	return !('message' in record) && !('error' in record) && !('result' in record);
}

function firstProviderString(value: unknown, paths: string[][]): string | undefined {
	for (const path of paths) {
		let current = value;
		for (const segment of path) {
			if (typeof current !== 'object' || current === null || !(segment in current)) {
				current = undefined;
				break;
			}
			current = (current as Record<string, unknown>)[segment];
		}
		if (typeof current === 'string' && current.trim()) return current;
	}
	return undefined;
}

export function requestIdFromProviderText(text: string): string | undefined {
	return text.match(/Request ID:\s*([A-Za-z0-9_-]+)/i)?.[1];
}

export function cleanProviderMessage(text: string): string {
	return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}
