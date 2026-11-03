import type { ShellToken } from './shell-policy-tokens.ts';

import { REDIRECTIONS, type ShellItem } from './shell-policy-items.ts';

/**
 * The structure the bash policy parses a command into (`shell-policy-parse.ts`), and the cursor the
 * grammar reads items with. A word is read on its unquoted view, so `"for"` and `\for` are never
 * the reserved word.
 */

export type Redirect = { op: string; target: string };

export type ShellNode =
	| {
			/** A body bash runs again or later: a while or until loop. */
			body: boolean;
			kind: 'other';
			parts: ShellList[];
			redirects: Redirect[];
			start: number | undefined;
	  }
	| {
			/** Assignment words before the command name; those that build an array, separately. */
			arrays: number[];
			assignments: number[];
			/** Whether a word other than an assignment is present. */
			commandWord: boolean;
			kind: 'simple';
			redirects: Redirect[];
	  }
	| {
			body: ShellList;
			/** The `done` that closes it. */
			end: number;
			/** Undefined for an arithmetic for, or when there is no `in` list. */
			items: (number | undefined)[] | undefined;
			kind: 'loop';
			name: string | undefined;
			redirects: Redirect[];
			start: number;
	  }
	| { body: ShellList; kind: 'group'; redirects: Redirect[] }
	| { body: ShellNode; kind: 'function'; redirects: Redirect[]; start: number | undefined };

export type ShellPipeline = { commands: ShellNode[]; plain: boolean };
export type ShellAndOr = { background: boolean; pipelines: ShellPipeline[] };
export type ShellList = ShellAndOr[];

/** Thrown with the construct that stopped the parse. */
export class Unparsed extends Error {}

export abstract class ShellCursor {
	readonly items: ShellItem[];
	pos = 0;
	readonly tokens: ShellToken[];

	constructor(items: ShellItem[], tokens: ShellToken[]) {
		this.items = items;
		this.tokens = tokens;
	}

	abstract command(): ShellNode;
	abstract list(): ShellList;

	peek(): ShellItem | undefined {
		return this.items[this.pos];
	}

	isOp(op: string, offset = 0, glued = false): boolean {
		const item = this.items[this.pos + offset];
		return item?.kind === 'op' && item.op === op && (!glued || item.glued);
	}

	opAt(at: number): string {
		const item = this.items[at];
		return item?.kind === 'op' ? item.op : '';
	}

	/** The unquoted spelling of the word at `at`, or undefined for an operator or an empty word. */
	wordAt(at: number): string | undefined {
		const token = this.tokenAt(at);
		return token === undefined ? undefined : this.unquoted(token);
	}

	tokenAt(at: number): number | undefined {
		const item = this.items[at];
		return item?.kind === 'word' ? item.token : undefined;
	}

	unquoted(token: number): string {
		return this.tokens[token]?.unquoted ?? '';
	}

	skipNewlines(): void {
		while (this.isOp('\n')) this.pos += 1;
	}

	expectWord(word: string): number {
		const token = this.tokenAt(this.pos);
		if (this.wordAt(this.pos) !== word || token === undefined) this.fail(`a missing '${word}'`);
		this.pos += 1;
		return token;
	}

	expectOp(op: string): void {
		if (!this.isOp(op)) this.fail(`a missing '${op}'`);
		this.pos += 1;
	}

	/** From an opening `(`: skips to its matching `)`, whatever lies between. */
	skipBalanced(): void {
		let depth = 0;
		for (let item = this.peek(); item !== undefined; item = this.peek()) {
			this.pos += 1;
			if (item.kind !== 'op') continue;
			if (item.op === '(') depth += 1;
			if (item.op === ')') depth -= 1;
			if (depth === 0) return;
		}
		this.fail('an unclosed (');
	}

	/** A word of digits right before a redirection, as in `2>&1`. */
	isIoNumber(): boolean {
		const word = this.wordAt(this.pos);
		const next = this.items[this.pos + 1];
		if (word === undefined || !/^\d+$/.test(word) || next?.kind !== 'op') return false;
		return next.glued && REDIRECTIONS.has(next.op);
	}

	isRedirect(): boolean {
		return this.isIoNumber() || REDIRECTIONS.has(this.opAt(this.pos));
	}

	redirect(): Redirect {
		if (this.isIoNumber()) this.pos += 1;
		const op = this.peek();
		const target = this.items[this.pos + 1];
		if (op?.kind !== 'op' || target?.kind !== 'word') this.fail('a redirection with no target');
		this.pos += 2;
		const text = target.token === undefined ? '' : this.unquoted(target.token);
		return { op: op.op, target: text };
	}

	/** The redirections after a compound command, which apply to all of it. */
	redirected<T extends ShellNode>(node: T): T {
		while (this.isRedirect()) node.redirects.push(this.redirect());
		return node;
	}

	describe(): string {
		const op = this.opAt(this.pos);
		if (op !== '') return `'${op === '\n' ? 'newline' : op}'`;
		return `'${this.wordAt(this.pos) ?? '""'}'`;
	}

	fail(construct: string): never {
		throw new Unparsed(construct);
	}
}
