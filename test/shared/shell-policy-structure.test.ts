import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy.ts';
import {
	shellStructure,
	type ShellStructure,
} from '../../shared/src/agent/tools/shell-policy-structure.ts';
import { scanShell } from '../../shared/src/agent/tools/shell-policy-tokens.ts';

const ROOT = '/projects/app';

function structureOf(command: string): ShellStructure | string {
	const scan = scanShell(command);
	return shellStructure(scan.tokens, scan.gap);
}

function parsed(command: string): ShellStructure {
	const structure = structureOf(command);
	if (typeof structure === 'string') throw new Error(`unparsed: ${structure}`);
	return structure;
}

/** The text of each assignment the structure marks as surely made in this shell. */
function sureWords(command: string): string[] {
	const tokens = scanShell(command).tokens;
	return [...parsed(command).sure].map((index) => tokens[index]?.text ?? '');
}

function lasting(command: string): boolean[] {
	return [...parsed(command).loops.values()].map((loop) => loop.lasting);
}

describe('reserved words', () => {
	test('count only unquoted and starting a command', () => {
		for (const command of [
			'echo "for" x in a "do"',
			'echo for x in a do',
			'echo done',
			"echo 'for' x in a 'do'",
			'echo \\for x',
		]) {
			expect(parsed(command).loops.size).toBe(0);
		}
		expect(parsed('for x in a; do :; done').loops.size).toBe(1);
		expect(parsed('if true; then for x in a; do :; done; fi').loops.size).toBe(1);
	});

	test('a closing word as an argument closes nothing', () => {
		expect(typeof structureOf('{ echo }; }')).toBe('object');
		expect(typeof structureOf('for x in a; do echo done; done')).toBe('object');
	});
});

describe('commands bash surely runs in this shell', () => {
	test('a whole-command assignment after ; or a newline', () => {
		expect(sureWords('a=x; b=y\nc=z')).toEqual(['a=x', 'b=y', 'c=z']);
		expect(sureWords('false && a=x; b=y')).toEqual(['b=y']);
		expect(sureWords('true & b=y')).toEqual(['b=y']);
		expect(sureWords('{ a=x; } && true')).toEqual(['a=x']);
	});

	test('not one that may be skipped, run elsewhere, or only set an environment', () => {
		for (const command of [
			'a=x true',
			'echo a=x',
			'false && a=x',
			'true || a=x',
			'a=x | true',
			'a=x & wait',
			'(a=x)',
			'{ a=x; } | cat',
			'if true; then a=x; fi',
			'while false; do a=x; done',
			'case x in x) a=x;; esac',
			'! a=x',
			'a=$((1+2))',
			'a=x >out.txt',
		]) {
			expect(sureWords(command)).toEqual([]);
		}
	});

	test('a loop keeps its name only when it surely runs here', () => {
		expect(lasting('for x in a; do :; done; ls')).toEqual([true]);
		expect(lasting('for x in a; do :; done && true | cat')).toEqual([true]);
		expect(lasting('for x in a; do :; done 2>&1')).toEqual([true]);
		expect(lasting('for x in a; do :; done && case x in x) :;; esac')).toEqual([true]);
		expect(lasting('for x in a; do :; done | cat')).toEqual([false]);
		expect(lasting('for x in a; do :; done && true & wait')).toEqual([false]);
		expect(lasting('false && for x in a; do :; done')).toEqual([false]);
		// select takes its name from the reply it reads, not its list.
		const select = [...parsed('select x in a; do break; done').loops.values()];
		expect(select.map(({ items, lasting: kept }) => ({ items, kept }))).toEqual([
			{ items: undefined, kept: false },
		]);
	});

	test('a redirection that can fail, or a closed descriptor, leaves nothing sure', () => {
		expect(lasting('for x in a; do :; done >nodir/x')).toEqual([false]);
		expect(lasting('for x in a; do :; done <nofile')).toEqual([false]);
		expect(lasting('{ for x in a; do :; done 2>&1; } 1>&-')).toEqual([false]);
		expect(lasting('for x in a; do :; done 3999>&1')).toEqual([false]);
		expect(lasting('for x in a; do :; done 0>&2')).toEqual([true]);
		expect(sureWords('{ a=x; } 99999<&2')).toEqual([]);
		expect(sureWords('a=x; true 2>&-')).toEqual([]);
		expect(sureWords('a=x; true >&"$f"')).toEqual([]);
	});

	test('a function body may run at any point, so nothing is sure once one is defined', () => {
		const structure = parsed('a=x; f() { b=y; }; f');
		expect(structure.sure.size).toBe(0);
		expect(structure.bodyStart).toBe(0);
		expect(parsed('function g { :; }').bodyStart).toBe(0);
	});

	test('an array assignment is noted, not trusted', () => {
		const structure = parsed('a=(x y); b=z');
		expect(structure.arrays.size).toBe(1);
		expect(sureWords('a=(x y); b=z')).toEqual(['b=z']);
	});
});

describe('a command the parser cannot read', () => {
	test('is denied with the construct named', () => {
		const cases: [string, string][] = [
			['{ ls', "a missing '}'"],
			['if true; then ls', "a missing 'fi'"],
			['(ls) b', "a misplaced 'b'"],
			['echo a;; ls', "a misplaced ';;'"],
			['coproc ls', 'a coproc'],
			['echo !(x)', 'a ( inside a command'],
			['for 1 in a; do :; done', 'a loop with no valid name'],
			[`ls src${String.fromCodePoint(0xa0)}; ls`, 'whitespace bash reads as part of a word'],
		];
		for (const [command, construct] of cases) {
			expect(structureOf(command)).toBe(construct);
			expect(checkBashWorkspacePolicy(command, ROOT)).toContain(construct);
		}
	});
});
