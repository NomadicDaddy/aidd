/**
 * The texts bash could turn one command string into before it reads words.
 *
 * Bash deletes a backslash-newline pair and lifts every redirection out of a simple command before
 * it looks at the words. The destructive-git check splits on newlines and on `&` and `|`, so a
 * line continuation cut a command in two and `2>&1` between a subcommand and its flag put them in
 * different segments, while a redirect target after `git` was read as the subcommand.
 *
 * Neither rewrite is applied in place. A backslash before `>` makes it an ordinary argument, and
 * removing that "redirection" would remove the flag after it, so the original text is judged as
 * well and any reading can deny.
 */

/** An optional descriptor, a redirection operator, and its target word. `<<` is a heredoc. */
const REDIRECTION =
	/\d*(?:&>>?|>>|>&|>\||>|<<<|<&|(?<!<)<(?![<(]))[ \t]*(?:"[^"]*"|'[^']*'|[^\s;|&()<>]+)/g;

export function liftRedirections(command: string): string {
	return command.replace(REDIRECTION, ' ');
}

export function gitReadings(command: string): string[] {
	const joined = command.replace(/\\\r?\n/g, '');
	return [...new Set([command, joined, liftRedirections(joined)])];
}
