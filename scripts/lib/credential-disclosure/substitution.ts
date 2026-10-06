/** The word left in place of a lifted substitution: no path, and no `$(` to re-lift. */
const PLACEHOLDER = 'SUBSTITUTION';

/** Index of the `)` that closes the substitution opened at `start`, or -1 when none does. */
function closingIndex(command: string, start: number): number {
	let depth = 1;
	let quote: string | undefined;
	for (let index = start; index < command.length; index++) {
		const character = command[index]!;
		if (quote === "'") {
			if (character === quote) quote = undefined;
		} else if (character === '\\') index++;
		else if (quote === '"') {
			if (character === quote) quote = undefined;
		} else if (character === '"' || character === "'") quote = character;
		else if (character === '(') depth++;
		else if (character === ')' && --depth === 0) return index;
	}
	return -1;
}

/**
 * Lift each top-level `$(...)` out of a command. Its text runs as a command of its own, and
 * splitting the outer command on separators would cut through it: a `|` inside
 * `echo n=$(git grep -c "x\.env" -- src | wc -l)` left the search pattern as a word of `echo`.
 * Single quotes keep a substitution literal; double quotes do not, and neither does a heredoc
 * body. A substitution a truncated log never closed runs to the end of the text.
 */
export function liftSubstitutions(command: string): { inner: string[]; outer: string } {
	const inner: string[] = [];
	let outer = '';
	let quote: string | undefined;
	for (let index = 0; index < command.length; index++) {
		const character = command[index]!;
		if (quote === "'") {
			if (character === quote) quote = undefined;
			outer += character;
		} else if (character === '\\') {
			outer += command.slice(index, index + 2);
			index++;
		} else if (character === '$' && command[index + 1] === '(' && command[index + 2] !== '(') {
			const close = closingIndex(command, index + 2);
			const end = close === -1 ? command.length : close;
			inner.push(command.slice(index + 2, end));
			outer += PLACEHOLDER;
			index = end;
		} else {
			if (quote === '"' && character === quote) quote = undefined;
			else if (quote === undefined && (character === '"' || character === "'"))
				quote = character;
			outer += character;
		}
	}
	return { inner, outer };
}
