import type { ShellCursor, ShellList, ShellNode } from './shell-policy-tree.ts';

/**
 * Bash's compound commands for the structure parser in `shell-policy-parse.ts`: if, while and until,
 * for and select, case, `[[ ]]`, `(( ))` and function definitions. Each starts at its opening word.
 */

export const CASE_ENDS = new Set([';;', ';;&', ';&']);
/** What may sit between `[[` and `]]` besides words. */
const CONDITION_OPS = new Set(['\n', '(', ')', '&&', '<', '>', '||']);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The words that open a compound command, any of which can be a function's body. */
const COMPOUND_WORDS = ['{', 'case', 'for', 'if', 'select', 'until', 'while', '[['];

function other(parts: ShellList[], body = false, start?: number): ShellNode {
	return { body, kind: 'other', parts, redirects: [], start };
}

/** `(( ... ))`, from its first `(`. */
export function arithmeticCommand(p: ShellCursor): ShellNode {
	p.skipBalanced();
	return other([]);
}

export function conditionCommand(p: ShellCursor): ShellNode {
	p.pos += 1;
	for (let item = p.peek(); p.wordAt(p.pos) !== ']]'; item = p.peek()) {
		if (item === undefined) p.fail('an unclosed [[');
		if (item.kind === 'op' && !CONDITION_OPS.has(item.op))
			p.fail(`a '${item.op}' inside [[ ]]`);
		p.pos += 1;
	}
	p.pos += 1;
	return other([]);
}

export function ifCommand(p: ShellCursor): ShellNode {
	p.pos += 1;
	const parts = [p.list()];
	p.expectWord('then');
	parts.push(p.list());
	while (p.wordAt(p.pos) === 'elif') {
		p.pos += 1;
		parts.push(p.list());
		p.expectWord('then');
		parts.push(p.list());
	}
	if (p.wordAt(p.pos) === 'else') {
		p.pos += 1;
		parts.push(p.list());
	}
	p.expectWord('fi');
	return other(parts);
}

export function whileCommand(p: ShellCursor): ShellNode {
	const start = p.tokenAt(p.pos);
	p.pos += 1;
	const condition = p.list();
	p.expectWord('do');
	const body = p.list();
	p.expectWord('done');
	return other([condition, body], true, start);
}

type LoopHeader = { items: (number | undefined)[] | undefined; name: string | undefined };

export function forCommand(p: ShellCursor): ShellNode {
	const start = p.tokenAt(p.pos) as number;
	const select = p.wordAt(p.pos) === 'select';
	p.pos += 1;
	const { items, name } =
		p.isOp('(') && p.isOp('(', 1, true) ? arithmeticHeader(p) : loopHeader(p);
	p.skipNewlines();
	p.expectWord('do');
	const body = p.list();
	const end = p.expectWord('done');
	return { body, end, items, kind: 'loop', name, redirects: [], select, start };
}

/** `for (( ... ))`, which binds no name the policy follows. */
function arithmeticHeader(p: ShellCursor): LoopHeader {
	p.skipBalanced();
	if (p.isOp(';')) p.pos += 1;
	return { items: undefined, name: undefined };
}

/** `NAME [in WORDS ;]`, or `NAME ;` with no list. */
function loopHeader(p: ShellCursor): LoopHeader {
	const name = p.wordAt(p.pos);
	if (name === undefined || !NAME.test(name)) p.fail('a loop with no valid name');
	p.pos += 1;
	p.skipNewlines();
	if (p.wordAt(p.pos) === 'in') return { items: loopItems(p), name };
	if (p.isOp(';')) p.pos += 1;
	return { items: undefined, name };
}

/** From `in`: the words up to the `;` or newline that ends the list. */
function loopItems(p: ShellCursor): (number | undefined)[] {
	p.pos += 1;
	const items: (number | undefined)[] = [];
	for (let item = p.peek(); item?.kind === 'word'; item = p.peek()) {
		items.push(item.token);
		p.pos += 1;
	}
	if (!p.isOp(';') && !p.isOp('\n')) p.fail("a loop list with no ';' after it");
	p.pos += 1;
	return items;
}

export function caseCommand(p: ShellCursor): ShellNode {
	p.pos += 1;
	if (p.peek()?.kind !== 'word') p.fail('a case with no word');
	p.pos += 1;
	p.skipNewlines();
	p.expectWord('in');
	const parts: ShellList[] = [];
	for (p.skipNewlines(); p.wordAt(p.pos) !== 'esac'; p.skipNewlines()) {
		parts.push(caseClause(p));
	}
	p.pos += 1;
	return other(parts);
}

/** `[(] PATTERN [| PATTERN]... ) LIST`, through its `;;` unless `esac` follows directly. */
function caseClause(p: ShellCursor): ShellList {
	if (p.isOp('(')) p.pos += 1;
	patternWord(p);
	while (p.isOp('|')) {
		p.pos += 1;
		patternWord(p);
	}
	p.expectOp(')');
	const body = p.list();
	if (CASE_ENDS.has(p.opAt(p.pos))) p.pos += 1;
	else if (p.wordAt(p.pos) !== 'esac') p.fail('a case clause with no ;;');
	return body;
}

function patternWord(p: ShellCursor): void {
	if (p.peek()?.kind !== 'word') p.fail('a case pattern that is not a plain word');
	p.pos += 1;
}

/** `function NAME [()] BODY`, from `function`. */
export function functionCommand(p: ShellCursor): ShellNode {
	const start = p.pos;
	p.pos += 1;
	if (p.peek()?.kind !== 'word') p.fail('a function with no name');
	p.pos += 1;
	if (p.isOp('(')) {
		p.pos += 1;
		p.expectOp(')');
	}
	return functionBody(p, start);
}

/** `NAME () BODY`, from the `(`. */
export function nameFunction(p: ShellCursor, nameAt: number): ShellNode {
	p.pos += 1;
	p.expectOp(')');
	return functionBody(p, nameAt);
}

function functionBody(p: ShellCursor, start: number): ShellNode {
	p.skipNewlines();
	const compound = p.isOp('(') || COMPOUND_WORDS.includes(p.wordAt(p.pos) ?? '');
	if (!compound) p.fail('a function whose body is not a compound command');
	return { body: p.command(), kind: 'function', redirects: [], start: p.tokenAt(start) };
}
