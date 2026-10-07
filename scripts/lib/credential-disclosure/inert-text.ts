import { tokenizeShell } from '../../../shared/src/agent/tools/shell-policy-tokens.ts';

/**
 * Credential paths that a command only writes or sends as text, never opens.
 *
 * The gate matched a credential path anywhere in a command, so an audit that wrote a list of probe
 * commands into a fixture file, or requested `/.env` from a local server to prove it is not served,
 * was reported as a disclosure of the file it named. Both helpers here are narrow on purpose: each
 * recognises one shape whose text cannot be a read, and anything else stays judged.
 */

/** Programs that open the files they are given. */
const FILE_READERS = new Set([
	'.',
	'awk',
	'base64',
	'bat',
	'cat',
	'cp',
	'gc',
	'get-content',
	'grep',
	'head',
	'less',
	'more',
	'mv',
	'od',
	'rg',
	'scp',
	'sed',
	'source',
	'strings',
	'tail',
	'tar',
	'type',
	'xxd',
	'zip',
]);

/** Programs that write their standard input to a file without interpreting it. */
const STDIN_WRITERS = new Set(['cat', 'tee']);

function programName(word: string): string {
	return (word.split(/[/\\]/).at(-1) ?? word).toLowerCase();
}

/** The simple command a heredoc operator belongs to: the text after the last separator. */
function heredocOwner(lineBeforeOperator: string): string {
	return lineBeforeOperator.split(/&&|\|\||[;|&]/).at(-1) ?? lineBeforeOperator;
}

/**
 * Removes the body of a heredoc that is plain data: its delimiter is quoted, so the shell expands
 * nothing in it, and it is fed to `cat` or `tee` writing a file. A body with an unquoted delimiter
 * can run a command substitution, and a body fed to a shell or an interpreter is executed, so both
 * are left in place.
 */
export function stripInertHeredocs(command: string): string {
	const lines = command.split('\n');
	const kept: string[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		kept.push(line);
		const operator = /<<(-?)\s*(['"])([A-Za-z_]\w*)\2/.exec(line);
		if (operator === null) continue;
		const owner = heredocOwner(line.slice(0, operator.index));
		const words = tokenizeShell(owner).map((token) => token.text);
		const program = programName(words[0] ?? '');
		const redirectsToFile = /(?:^|[^<>&\d])>{1,2}(?!&)/.test(line.replace(operator[0], ''));
		const writesFile =
			STDIN_WRITERS.has(program) && (program === 'tee' ? words.length > 1 : redirectsToFile);
		if (!writesFile) continue;
		const delimiter = operator[3] ?? '';
		const stripTabs = operator[1] === '-';
		let end = index + 1;
		while (end < lines.length) {
			// A CRLF log leaves the carriage return on every line; the shell would see the
			// terminator, so the comparison must too, or the rest of the command reads as body.
			const candidate = (lines[end] ?? '').replace(/\r$/, '');
			if ((stripTabs ? candidate.replace(/^\t+/, '') : candidate) === delimiter) break;
			end += 1;
		}
		// With no terminator, the shell reads every remaining line as the body, so nothing after
		// the operator is a command. A run log that truncates a long command produces this shape.
		index = end;
	}
	return kept.join('\n');
}

/** True when some command opens a file named through the loop variable. */
export function loopVariableIsRead(name: string, segments: string[]): boolean {
	const references = [`$${name}`, `\${${name}`];
	for (const segment of segments) {
		const words = tokenizeShell(segment).map((token) => token.text);
		// A loop body's first command follows `do`, and a branch's follows `then` or `else`.
		while (['!', '{', 'do', 'else', 'then'].includes(words[0] ?? '')) words.shift();
		const program = programName(words[0] ?? '');
		const named = words.slice(1).filter((word) => references.some((ref) => word.includes(ref)));
		if (named.length === 0) continue;
		if (FILE_READERS.has(program)) return true;
		// An upload reads the file it names: `curl -T "$F"`, `curl -d @"$F"`.
		const uploads =
			named.some((word) => word.startsWith('@')) ||
			words.some((word) => ['--upload-file', '-T'].includes(word));
		if (uploads) return true;
		// A redirect from the variable opens it whatever the program is.
		if (
			references.some((ref) =>
				new RegExp(`<\\s*"?\\${ref.replace('{', '\\{')}`).test(segment),
			)
		)
			return true;
	}
	return false;
}
