import type { ShellToken } from './shell-policy-tokens.ts';
import type { Redirect, ShellList, ShellNode, ShellPipeline } from './shell-policy-tree.ts';

import { shellItems } from './shell-policy-items.ts';
import { parseShell } from './shell-policy-parse.ts';

/**
 * What the static expansion asks of a command's structure: which assignments bash surely makes in
 * this shell, which loops it surely runs here, and where a body that may run again or later starts.
 *
 * A command is surely run in this shell when nothing before it can skip it and nothing moves it to
 * a subshell: it opens its `&&`/`||` list, its pipeline is just itself, the list is not in the
 * background, and it is not inside a subshell, a conditional, a loop or a function. A `{ }` group
 * passes its own standing on to what it holds. A redirection that can fail stops the command before
 * it runs (`done >nodir/x`, `done <nofile`), so only a duplication onto fd 1 or 2 keeps it sure, and
 * nothing is sure once the command closes a descriptor, which could make that duplication fail.
 */

export type ShellLoop = {
	end: number;
	/** Each item's token, undefined for a word quotes made empty; undefined with no `in` list. */
	items: (number | undefined)[] | undefined;
	/** Bash surely runs the loop in this shell, so its name keeps the last item afterwards. */
	lasting: boolean;
	name: string | undefined;
};

export type ShellStructure = {
	/** Assignment words that build an array, whose value this policy doesn't track. */
	arrays: Set<number>;
	/** The first token of any body bash may run again or later, or Infinity. */
	bodyStart: number;
	/** Loops by the token of their `for` or `select`. */
	loops: Map<number, ShellLoop>;
	/** Assignment words bash surely makes in this shell. */
	sure: Set<number>;
};

type Walk = { closesDescriptor: boolean; declaresFunction: boolean } & ShellStructure;

/** The structure of a scanned command, or the construct the parser could not read. */
export function shellStructure(tokens: ShellToken[], trailingGap: string): ShellStructure | string {
	const items = shellItems(tokens, trailingGap);
	if (typeof items === 'string') return items;
	const list = parseShell(items, tokens);
	if (typeof list === 'string') return list;
	const walk: Walk = {
		arrays: new Set(),
		bodyStart: Number.POSITIVE_INFINITY,
		closesDescriptor: false,
		declaresFunction: false,
		loops: new Map(),
		sure: new Set(),
	};
	walkList(list, true, walk);
	// A function may run at any point after its definition, and a closed descriptor can make any
	// duplication fail, so neither leaves anything sure.
	if (walk.declaresFunction || walk.closesDescriptor) {
		walk.sure.clear();
		for (const loop of walk.loops.values()) loop.lasting = false;
	}
	if (walk.declaresFunction) walk.bodyStart = 0;
	return { arrays: walk.arrays, bodyStart: walk.bodyStart, loops: walk.loops, sure: walk.sure };
}

function walkList(list: ShellList, sure: boolean, walk: Walk): void {
	for (const andOr of list) {
		for (const [index, pipeline] of andOr.pipelines.entries()) {
			const pipelineSure = sure && !andOr.background && index === 0 && runsHere(pipeline);
			for (const node of pipeline.commands) walkNode(node, pipelineSure, walk);
		}
	}
}

/** A pipeline of one command, with no `!` or `time`, runs that command in this shell. */
function runsHere(pipeline: ShellPipeline): boolean {
	return pipeline.plain && pipeline.commands.length === 1;
}

function walkNode(node: ShellNode, standing: boolean, walk: Walk): void {
	noteRedirects(node.redirects, walk);
	const sure = standing && node.redirects.every(cannotFail);
	switch (node.kind) {
		case 'function':
			walk.declaresFunction = true;
			noteBody(node.start, walk);
			walkNode(node.body, false, walk);
			return;
		case 'group':
			walkList(node.body, sure, walk);
			return;
		case 'loop':
			walkLoop(node, sure, walk);
			return;
		case 'other':
			walkOther(node, walk);
			return;
		case 'simple':
			walkSimple(node, sure, walk);
	}
}

/**
 * A for or select loop. A select's name comes from the reply it reads (empty, or nothing at EOF),
 * never from its list, so it is treated like a loop with no list: the name is unknown.
 */
function walkLoop(node: Extract<ShellNode, { kind: 'loop' }>, sure: boolean, walk: Walk): void {
	walk.loops.set(node.start, {
		end: node.end,
		items: node.select ? undefined : node.items,
		lasting: sure && !node.select,
		name: node.name,
	});
	noteBody(node.start, walk);
	walkList(node.body, false, walk);
}

/** A subshell, conditional, case or while loop: nothing inside it is surely run in this shell. */
function walkOther(node: Extract<ShellNode, { kind: 'other' }>, walk: Walk): void {
	if (node.body) noteBody(node.start, walk);
	for (const part of node.parts) walkList(part, false, walk);
}

/**
 * An assignment with a command name only sets that program's environment, and one with a
 * redirection is made only if the redirection succeeds.
 */
function walkSimple(node: Extract<ShellNode, { kind: 'simple' }>, sure: boolean, walk: Walk): void {
	for (const token of node.arrays) walk.arrays.add(token);
	if (!sure || node.commandWord || node.redirects.length > 0) return;
	for (const token of node.assignments) walk.sure.add(token);
}

function noteBody(start: number | undefined, walk: Walk): void {
	if (start !== undefined) walk.bodyStart = Math.min(walk.bodyStart, start);
}

const STANDARD = new Set(['0', '1', '2']);

/**
 * `2>&1`, `>&2`: a duplication onto a standard descriptor, which only a closed one can fail. Its own
 * descriptor must be standard too: one past the open-file limit (`3999>&1`) fails as well.
 */
function cannotFail({ fd, op, target }: Redirect): boolean {
	if (op !== '>&' && op !== '<&') return false;
	return (fd === undefined || STANDARD.has(fd)) && (target === '1' || target === '2');
}

/** `>&-`, `<&-`, `2>&1-`, and any target bash only knows once it expands, which may be `-`. */
function noteRedirects(redirects: Redirect[], walk: Walk): void {
	for (const { op, target } of redirects) {
		if ((op === '>&' || op === '<&') && !/^\d+$/.test(target)) walk.closesDescriptor = true;
	}
}
