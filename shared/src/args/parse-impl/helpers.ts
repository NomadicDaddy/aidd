import { normalizeBackendName, type BackendName } from '../../plan/types.ts';
import {
	normalizeReasoningEffort,
	normalizeThinkingLevel,
	type ReasoningEffortValue,
	type ThinkingLevelValue,
} from '../constants.ts';
import { ArgsError } from '../validate.ts';

export function parseList(raw: string): string[] {
	return raw
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export function parseBackend(raw: string): BackendName {
	const normalized = normalizeBackendName(raw);
	if (!normalized) {
		throw new ArgsError(`Invalid CLI type: ${raw}`);
	}
	return normalized;
}

export function parseReasoningEffort(raw: string): ReasoningEffortValue {
	const result = normalizeReasoningEffort(raw);
	if (result === undefined) {
		throw new ArgsError(`Invalid --reasoning-effort: '${raw}'`);
	}
	return result;
}

export function parseThinkingLevel(raw: string): ThinkingLevelValue {
	const result = normalizeThinkingLevel(raw);
	if (result === undefined) {
		throw new ArgsError(`Invalid --thinking-level: '${raw}'`);
	}
	return result;
}

export interface ExpandedArgv {
	argv: string[];
	inlineValueIndices: Set<number>;
}

// Expand `--flag=value` into separate `--flag` and `value` tokens so the switch
// (which matches exact flag tokens) handles both spellings. Each expanded value's index
// is recorded so requireValue() accepts it even when it begins with `--` — e.g.
// `--prompt=--literal-dashes`, which the space-separated `--prompt --literal-dashes`
// form intentionally rejects as a missing value.
export function expandInlineValues(argv: string[]): ExpandedArgv {
	const inlineValueIndices = new Set<number>();
	const expandedArgv: string[] = [];
	for (const token of argv) {
		const equals = token.startsWith('--') ? token.indexOf('=') : -1;
		if (equals === -1) {
			expandedArgv.push(token);
			continue;
		}
		expandedArgv.push(token.slice(0, equals));
		inlineValueIndices.add(expandedArgv.length);
		expandedArgv.push(token.slice(equals + 1));
	}
	return { argv: expandedArgv, inlineValueIndices };
}

export function createRequireValue(
	argv: string[],
	inlineValueIndices: Set<number>
): (index: number, flag: string) => string {
	return (index: number, flag: string): string => {
		const value = argv[index + 1];
		if (value === undefined || (value.startsWith('--') && !inlineValueIndices.has(index + 1))) {
			throw new ArgsError(`${flag} requires a value`);
		}
		return value;
	};
}

export function createParseNumber(
	requireValue: (index: number, flag: string) => string
): (index: number, flag: string) => number {
	return (index: number, flag: string): number => {
		const raw = requireValue(index, flag);
		const value = Number(raw);
		if (!Number.isInteger(value) || value < 0) {
			throw new ArgsError(`${flag} must be a non-negative integer`);
		}
		return value;
	};
}

// Like createParseNumber but allows fractional values (e.g. a USD cost budget such as 0.01).
export function createParseDecimal(
	requireValue: (index: number, flag: string) => string
): (index: number, flag: string) => number {
	return (index: number, flag: string): number => {
		const raw = requireValue(index, flag);
		const value = Number(raw);
		if (!Number.isFinite(value) || value < 0) {
			throw new ArgsError(`${flag} must be a non-negative number`);
		}
		return value;
	};
}
