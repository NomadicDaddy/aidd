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

interface BashCharacter {
	readonly char: string;
	readonly offset: number;
	/** How bash read it: `escaped` follows a backslash, `none` is outside every quote. */
	readonly state: 'double' | 'escaped' | 'none' | 'single';
}

/** The characters bash passes on from `text`, each with its offset and how it was quoted. */
function bashCharacters(text: string): BashCharacter[] {
	const characters: BashCharacter[] = [];
	let quote: '"' | "'" | undefined;
	for (let offset = 0; offset < text.length; offset++) {
		const char = text[offset]!;
		const next = text[offset + 1];
		if (quote === "'") {
			if (char === quote) quote = undefined;
			else characters.push({ char, offset, state: 'single' });
		} else if (char === '\\' && next === '\n') offset++;
		else if (char === '\\' && (quote === undefined || '"$\\`'.includes(next ?? '-'))) {
			if (next !== undefined)
				characters.push({ char: next, offset: ++offset, state: 'escaped' });
		} else if (quote === '"') {
			if (char === quote) quote = undefined;
			else characters.push({ char, offset, state: 'double' });
		} else if (char === '"' || char === "'") quote = char;
		else characters.push({ char, offset, state: 'none' });
	}
	return characters;
}

/** Cmdlets that write their pipeline input to a file without interpreting it. */
const HERE_STRING_WRITER = /^\s*(?:\|\s*(?:Add-Content|Out-File|Set-Content)\b|>{1,2})/i;

/** What precedes a PowerShell script argument in its simple command, as bash reads it. */
const POWERSHELL_SCRIPT_OWNER =
	/(?:^|[\s/\\])(?:powershell|pwsh)(?:\.exe)?\s(?:.*\s)?-(?:c|command)\s+$/is;

/** True when the bash word holding `start` is the script argument of `pwsh -Command`. */
function inPowerShellScript(characters: BashCharacter[], start: number): boolean {
	const unquoted = (index: number, pattern: RegExp): boolean =>
		characters[index]?.state === 'none' && pattern.test(characters[index]!.char);
	let word = start;
	while (word > 0 && !unquoted(word - 1, /[\s;|&]/)) word--;
	let statement = word;
	while (statement > 0 && !unquoted(statement - 1, /[\n;|&]/)) statement--;
	const owner = characters
		.slice(statement, word)
		.map(({ char }) => char)
		.join('');
	return POWERSHELL_SCRIPT_OWNER.test(owner);
}

/**
 * Masks the body of a PowerShell here-string that a `pwsh -Command` script only writes to a file,
 * as {@link stripInertHeredocs} drops a bash heredoc's. Codex wraps each PowerShell script in bash
 * quotes, and the quote readers here, which do not read backslashes as bash does, misread them
 * around a `\"` in the body; so the here-string is found in bash's own reading of the command and
 * only then masked in the raw text. The mask keeps every quote and backslash, so each later reading
 * is in the same quote after the terminator as it was before, and judges what follows unchanged.
 *
 * Narrow on purpose: the `@'` or `@"` stands alone on its line inside the script argument of
 * `pwsh -Command`, the terminator opens its line and pipes or redirects into a file writer, and the
 * whole here-string is inside bash's quotes. A body bash would expand (`$(` or a backtick in its
 * double quotes) and a `@"` body with a `$(` subexpression run commands, so both stay judged.
 */
export function maskInertHereStrings(command: string): string {
	const characters = bashCharacters(command);
	const script = characters.map(({ char }) => char).join('');
	// By UTF-16 unit, as the offsets are; a spread would split by code point.
	const masked = command.split('');
	for (const opener of script.matchAll(/(?<=^|\n)[ \t]*@(['"])\r?\n/g)) {
		const quote = opener[1]!;
		const start = opener.index + opener[0].indexOf('@');
		const terminator = new RegExp(`\\n${quote}@`).exec(script.slice(start));
		if (terminator === null) continue;
		const end = start + terminator.index + terminator[0].length;
		const after = script.slice(end).split('\n')[0] ?? '';
		if (!HERE_STRING_WRITER.test(after) || !inPowerShellScript(characters, start)) continue;
		const region = characters.slice(start, end);
		const expands = region.some(
			({ char, state }, index) =>
				state === 'none' ||
				(state === 'double' &&
					(char === '`' || (char === '$' && region[index + 1]?.char === '('))),
		);
		if (expands || (quote === '"' && script.slice(start, end).includes('$('))) continue;
		for (let offset = region[0]!.offset; offset <= region.at(-1)!.offset; offset++)
			if (!'\'"\\\n'.includes(masked[offset]!)) masked[offset] = '_';
	}
	return masked.join('');
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
