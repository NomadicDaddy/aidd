import type { ShellToken } from './shell-policy-tokens.ts';

import {
	arithmeticCommand,
	CASE_ENDS,
	caseCommand,
	conditionCommand,
	forCommand,
	functionCommand,
	ifCommand,
	nameFunction,
	whileCommand,
} from './shell-policy-compound.ts';
import { REDIRECTIONS, type ShellItem } from './shell-policy-items.ts';
import {
	type ShellAndOr,
	ShellCursor,
	type ShellList,
	type ShellNode,
	type ShellPipeline,
	Unparsed,
} from './shell-policy-tree.ts';

/**
 * Bash's command structure, parsed from the scan's words and operators, so the policy can ask
 * which commands bash surely runs in this shell instead of guessing it from separators. A reserved
 * word counts only where bash reads one, unquoted and starting a command. Anything this grammar
 * doesn't cover is refused with the construct named, never read some other way.
 */

/** Reserved words that end a list; each is read only where a command could start. */
const CLOSERS = new Set(['}', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'then']);
const LIST_ENDS = new Set(['\n', ';', '&']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** The command's structure, or the construct that stopped the parse. */
export function parseShell(items: ShellItem[], tokens: ShellToken[]): ShellList | string {
	const parser = new ShellParser(items, tokens);
	try {
		const list = parser.list();
		if (parser.pos < items.length) parser.fail(`a misplaced ${parser.describe()}`);
		return list;
	} catch (error) {
		if (error instanceof Unparsed) return error.message;
		throw error;
	}
}

type SimpleNode = Extract<ShellNode, { kind: 'simple' }>;

/** The compound commands that open with a reserved word, each taking its trailing redirections. */
const COMPOUNDS = new Map<string, (p: ShellCursor) => ShellNode>([
	['[[', conditionCommand],
	['case', caseCommand],
	['for', forCommand],
	['if', ifCommand],
	['select', forCommand],
	['until', whileCommand],
	['while', whileCommand],
]);

class ShellParser extends ShellCursor {
	list(): ShellList {
		const list: ShellList = [];
		this.skipNewlines();
		while (this.peek() !== undefined && !this.endsList()) {
			const andOr = this.andOr();
			list.push(andOr);
			const end = this.opAt(this.pos);
			if (!LIST_ENDS.has(end)) break;
			andOr.background = end === '&';
			this.pos += 1;
			this.skipNewlines();
		}
		return list;
	}

	command(): ShellNode {
		const item = this.peek();
		if (item === undefined) this.fail('an operator with no command after it');
		if (this.isOp('(')) return this.subshell();
		const word = this.wordAt(this.pos);
		if (word === '{') return this.group();
		const compound = this.compound(word);
		if (compound !== undefined) return compound;
		this.refuseMisplaced(item, word);
		return this.simple();
	}

	/** A reserved word that closes an enclosing compound, a `)`, or a case terminator. */
	private endsList(): boolean {
		if (CLOSERS.has(this.wordAt(this.pos) ?? '')) return true;
		return this.isOp(')') || CASE_ENDS.has(this.opAt(this.pos));
	}

	/** `( LIST )`, or `(( ... ))` when the two parentheses touch. */
	private subshell(): ShellNode {
		if (this.isOp('(', 1, true)) return this.redirected(arithmeticCommand(this));
		this.pos += 1;
		const body = this.list();
		this.expectOp(')');
		return this.redirected({
			body: false,
			kind: 'other',
			parts: [body],
			redirects: [],
			start: undefined,
		});
	}

	private group(): ShellNode {
		this.pos += 1;
		const body = this.list();
		this.expectWord('}');
		return this.redirected({ body, kind: 'group', redirects: [] });
	}

	private compound(word: string | undefined): ShellNode | undefined {
		if (word === 'function') return functionCommand(this);
		if (word === 'coproc') this.fail('a coproc');
		const parse = word === undefined ? undefined : COMPOUNDS.get(word);
		return parse === undefined ? undefined : this.redirected(parse(this));
	}

	/** A closing reserved word or an operator where a command should start. */
	private refuseMisplaced(item: ShellItem, word: string | undefined): void {
		if (word !== undefined && CLOSERS.has(word)) this.fail(`a misplaced '${word}'`);
		if (item.kind === 'op' && !REDIRECTIONS.has(item.op)) this.fail(`a misplaced '${item.op}'`);
	}

	private andOr(): ShellAndOr {
		const pipelines = [this.pipeline()];
		while (this.isOp('&&') || this.isOp('||')) {
			this.pos += 1;
			this.skipNewlines();
			pipelines.push(this.pipeline());
		}
		return { background: false, pipelines };
	}

	private pipeline(): ShellPipeline {
		let plain = true;
		while (this.wordAt(this.pos) === '!' || this.wordAt(this.pos) === 'time') {
			const timed = this.wordAt(this.pos) === 'time';
			this.pos += 1;
			if (timed && this.wordAt(this.pos) === '-p') this.pos += 1;
			plain = false;
		}
		const commands = [this.command()];
		while (this.isOp('|') || this.isOp('|&')) {
			this.pos += 1;
			this.skipNewlines();
			commands.push(this.command());
		}
		return { commands, plain };
	}

	private simple(): ShellNode {
		const node: SimpleNode = {
			arrays: [],
			assignments: [],
			commandWord: false,
			kind: 'simple',
			redirects: [],
		};
		let words = 0;
		for (let item = this.peek(); item !== undefined; item = this.peek()) {
			if (this.isRedirect()) {
				node.redirects.push(this.redirect());
				continue;
			}
			if (item.kind === 'op') {
				if (item.op !== '(') break;
				return this.functionDefinition(node, words);
			}
			words += 1;
			this.pos += 1;
			this.word(node, item.token);
		}
		return node;
	}

	/** `NAME ()`: exactly one word, and nothing else, before the parentheses. */
	private functionDefinition(node: SimpleNode, words: number): ShellNode {
		if (words === 1 && node.commandWord && node.redirects.length === 0) {
			return nameFunction(this, this.pos - 1);
		}
		this.fail('a ( inside a command');
	}

	/**
	 * Files one word of a simple command. An assignment counts only before the command name, and one
	 * whose value bash computes (`a=$((1+2))`) or that builds an array (`a=(x)`) is never sure.
	 */
	private word(node: SimpleNode, token: number | undefined): void {
		const arithmetic = this.arithmeticExpansion(token);
		if (node.commandWord || token === undefined || !this.isAssignment(token)) {
			node.commandWord = true;
		} else if (this.isOp('(', 0, true) && this.unquoted(token).endsWith('=')) {
			node.arrays.push(token);
			this.skipBalanced();
		} else if (!arithmetic) {
			node.assignments.push(token);
		}
	}

	/** `$((...))` after a word ending in an unquoted `$`, consumed as part of the word. */
	private arithmeticExpansion(token: number | undefined): boolean {
		if (token === undefined || !this.unquoted(token).endsWith('$')) return false;
		if (!this.isOp('(', 0, true) || !this.isOp('(', 1, true)) return false;
		this.skipBalanced();
		return true;
	}

	private isAssignment(token: number): boolean {
		return ASSIGNMENT.test(this.unquoted(token));
	}
}
