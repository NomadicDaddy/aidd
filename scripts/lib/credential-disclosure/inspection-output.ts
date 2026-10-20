import { credentialLabel } from './paths.ts';

/** Strip only recognizable shell startup lines, never arbitrary text before the first match. */
function outputLines(output: string): string[] {
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (/^PS \d+\.\d+\.\d+$/.test(lines[0] ?? '')) {
		lines.shift();
		if (lines[0] === "Don't Panic.") lines.shift();
		if (/^Aliases Loaded: [\w, -]+$/.test(lines[0] ?? '')) lines.shift();
	}
	return lines;
}

const ACCOUNT = String.raw`(?:[\w .-]+\\[\w .-]+|S-\d+(?:-\d+)+)`;
const account = new RegExp(`^${ACCOUNT}$`);
const rights = '(?:FullControl|Modify|ReadAndExecute|Read|Write|Synchronize)';
const aclLine = new RegExp(
	`^(?:ACL=)?${ACCOUNT}\\|${rights}(?:, ${rights})*\\|(?:Allow|Deny)\\|Inherited=(?:True|False)$|` +
		`^(?:ACL=)?${ACCOUNT}\\|${rights}(?:, ${rights})*\\|Inherited=(?:True|False)\\|(?:Allow|Deny)$`,
);

function aclJson(lines: string[]): boolean {
	let value: unknown;
	try {
		value = JSON.parse(lines.join('\n'));
	} catch {
		return false;
	}
	const rows: unknown[] = Array.isArray(value) ? value : [value];
	return (
		rows.length > 0 &&
		rows.every((row) => {
			if (typeof row !== 'object' || row === null) return false;
			const record = row as Record<string, unknown>;
			return (
				Object.keys(record).sort().join(',') === 'Owner,Path,Principals' &&
				typeof record['Path'] === 'string' &&
				typeof record['Owner'] === 'string' &&
				account.test(record['Owner']) &&
				Array.isArray(record['Principals']) &&
				record['Principals'].length > 0 &&
				record['Principals'].every(
					(principal: unknown) =>
						typeof principal === 'string' && account.test(principal),
				)
			);
		})
	);
}

function aclTable(lines: string[]): boolean {
	if (!/^Path\s+(?:Owner|Protected)\s+Principals$/.test(lines[0] ?? '')) return false;
	if (!/^-+\s+-+\s+-+$/.test(lines[1] ?? '') || lines.length < 3) return false;
	const row = new RegExp(`^.+?\\s+(?:${ACCOUNT}|True|False)\\s+${ACCOUNT}[\\w .\\\\,…-]*$`);
	return lines.slice(2).every((line) => row.test(line));
}

/** ACL metadata is not file content. Require every returned line to have a metadata shape. */
function aclOutput(lines: string[]): boolean {
	if (aclJson(lines) || aclTable(lines)) return true;
	const owner = new RegExp(
		`^(?:owner=|PATH=.+ OWNER=)${ACCOUNT}(?: PROTECTED=(?:True|False))?$`,
		'i',
	);
	return (
		lines.some((line) => aclLine.test(line)) &&
		lines.every(
			(line) =>
				aclLine.test(line) || owner.test(line) || /^env_exists=(?:true|false)$/.test(line),
		)
	);
}

/** The search's own arguments: the text up to the first unquoted separator ends its statement. */
function ownStatement(text: string): string {
	let quote: string | undefined;
	for (let index = 0; index < text.length; index++) {
		const character = text[index]!;
		if (quote) {
			if (character === quote) quote = undefined;
			else if (character === '\\' && quote === '"') index++;
		} else if (character === '"' || character === "'") quote = character;
		else if (character === '\\') index++;
		else if (';|&\n}'.includes(character)) return text.slice(0, index);
	}
	return text;
}

/** Each rg in the command with only its own statement, so a later search is judged too. */
function searchStatements(command: string): string[] {
	const statements: string[] = [];
	for (const match of command.matchAll(/(?:^|[\s"'{(;|&])rg(?:\.exe)?\s/g))
		statements.push(ownStatement(command.slice(match.index + match[0].length)));
	return statements;
}

/**
 * A line the command prints from its own quoted literal is the command's text, not a file's. The
 * literal must stand where its value is printed: a statement of its own (PowerShell writes a bare
 * string) or the argument of echo, printf or Write-Output/Write-Host. A quoted assignment is never
 * printed, and a line shaped like a search hit in a credential file is never excused this way.
 */
function echoedLiteral(line: string, command: string): boolean {
	const hitPath = /^(.+?):\d+:/.exec(line)?.[1];
	if (hitPath !== undefined && credentialLabel(hitPath) !== undefined) return false;
	const text = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// A PowerShell script quoted for bash spells `{'text'}` as `{'"'text'}`; the `'"` is bash
	// re-opening its quote, so it may stand between the print position and the literal.
	const printed = new RegExp(
		`(?:^|[{;(]|\\b(?:echo|printf|Write-Output|Write-Host)\\s)\\s*(?:'"|"')?(['"])${text}\\1\\s*(?:[});\\n]|$)`,
		'i',
	);
	return printed.test(command);
}

/** A reader's own report that an operand does not exist: GNU wording, or Windows through rg. */
const MISSING_FILE =
	/^(rg|grep|cat)(?:\.exe)?: (.+): (?:No such file or directory|The system cannot find the (?:file|path) specified\.)(?: \(os error \d+\))?$/;

/**
 * The output lines the command's numbered searches account for: each names a noncredential file,
 * or is the command's own printed literal. Undefined when the command has no numbered search, or
 * a search drops or rewrites the filename that attributes a line.
 */
function numberedSearchLine(command: string): ((line: string) => boolean) | undefined {
	if (!/(?:^|[\s"'])rg\s+-n\b/.test(command)) return undefined;
	// These switches remove or rewrite the filename provenance used below. Each search carries only
	// its own statement's switches, so a later `Get-ChildItem -Force` is not rg's `-o`, and every
	// search in the command is judged, not only the first.
	const dropsProvenance =
		/(?:^|\s)(?:--(?:no-filename|replace|only-matching|json)|-[A-Za-z]*[hor][A-Za-z]*)(?:\s|=|$)/;
	if (searchStatements(command).some((statement) => dropsProvenance.test(statement)))
		return undefined;
	return (line) => {
		if (echoedLiteral(line, command)) return true;
		const path = /^(.+?):\d+:/.exec(line)?.[1];
		return path !== undefined && credentialLabel(path) === undefined;
	};
}

/** A statement that runs `git log --oneline`, and the line it prints: a short hash and a subject. */
const GIT_LOG_ONELINE = /\bgit(?:\.exe)?\s(?:[^;|&\n]*\s)?log\s(?:[^;|&\n]*\s)?--oneline\b/;
const LOG_LINE = /^[0-9a-f]{7,40} \S.*$/;

/** Statements that list file names, and the line they print: a bare relative path. */
const LISTS_FILES = [
	/\brg(?:\.exe)?\s(?:[^;|&\n]*\s)?--files\b/,
	/\bgit(?:\.exe)?\s(?:[^;|&\n]*\s)?ls-files\b/,
	/(?:^|[\s;|&("'])find\s/,
	// `ls -l` prints owners, sizes and dates beside each name, so only a plain listing counts.
	/(?:^|[\s;|&("'])ls(?=$|[\s;|&)"'])(?![^;|&\n]*\s-[A-Za-z]*l)/,
];
// A file name ends in a short extension; a bare token, a base64 key line or a JWT does not, and
// each of those is a whole credential file's content with none of the excluded characters.
const BARE_PATH = /^(?![-/]|[A-Za-z]:)[^\s"'`:{}=,[\]]+\.[A-Za-z0-9]{1,8}$/;

/**
 * True when `program` itself reported `operand` missing, once for every time `words` names it, and
 * nothing else in the output can be the file's content.
 *
 * Whether a credential path names the store depends on the working directory, and the command
 * cannot always show that: a bare `.aidd/config.json` is a project's metadata path in a project and
 * the user config after `cd ~`, or in an agent started in the home directory. So the spelling never
 * excuses a read; the reader's report does, because a reader that found no file returned none of
 * it. A report the command prints from its own text is no evidence, and a path named twice needs
 * two reports, since one of the reads may have run where the file exists.
 *
 * A report is only a line of text, and another file the command prints can hold the same line, so
 * `cat ~/.aidd/config.json; cat planted.txt` could pair a real read with a planted report. A real
 * read prints the file, so the report excuses the read only when every output line is accounted
 * for, and any other line may be the file's content and keeps the read judged. A line is accounted
 * for when it is one of these:
 *
 * - a missing-file report by a program the command runs for an operand it names;
 * - a line the numbered-search exception accepts;
 * - a `git log --oneline` line, when the command runs one;
 * - a bare relative path, when the command runs a file listing ({@link LISTS_FILES}).
 *
 * The last two are taken only where the command runs the program that prints that shape, because
 * the shape alone is no evidence: a planted file can hold it. Neither shape can carry a config's
 * content. A config line holds a quoted key, a `:` and usually braces or a comma, while a log line
 * starts with a bare hex hash and a path line has no quote, `:`, brace, `=` or comma and ends in a
 * file extension, which a bare token or key line of another store does not.
 */
export function reportedMissing(
	program: string,
	operand: string,
	words: string[],
	command: string,
	output: unknown,
): boolean {
	if (typeof output !== 'string') return false;
	const lines = outputLines(output);
	const reportOf = (line: string): null | RegExpExecArray =>
		command.includes(line) ? null : MISSING_FILE.exec(line);
	const programs = new Set(
		words.map((word) =>
			(word.split(/[/\\]/).at(-1) ?? word).toLowerCase().replace(/\.exe$/, ''),
		),
	);
	const searchLine = numberedSearchLine(command);
	const logs = GIT_LOG_ONELINE.test(command);
	const lists = LISTS_FILES.some((listing) => listing.test(command));
	const accounted = lines.every((line) => {
		const report = reportOf(line);
		if (report !== null) return programs.has(report[1]!) && words.includes(report[2]!);
		return (
			(searchLine?.(line) ?? false) ||
			(logs && LOG_LINE.test(line)) ||
			(lists && BARE_PATH.test(line))
		);
	});
	if (!accounted) return false;
	const reports = lines.filter((line) => {
		const report = reportOf(line);
		return report?.[1] === program.replace(/\.exe$/, '') && report[2] === operand;
	});
	return reports.length > 0 && reports.length >= words.filter((word) => word === operand).length;
}

/**
 * A compound command's nonempty stdout does not prove that its credential operand returned data.
 * Keep the exception evidence-based: numbered search results must all name noncredential files,
 * and ACL inspections must return only permission metadata. Mixed/unrecognized output fails closed.
 */
export function isNonDisclosingInspection(command: string, output: unknown): boolean {
	if (typeof output !== 'string') return false;
	const lines = outputLines(output);
	if (lines.length === 0) return false;
	// An inspection alongside an actual read must not excuse that read, even if its output happens
	// to resemble metadata. Include shell aliases, substitutions and common programmatic readers.
	if (
		/\b(?:cat|gc|type|Get-Content|Select-String|ReadAll\w*|OpenRead|readFile\w*|Invoke-\w+|iex)\b/i.test(
			command,
		)
	)
		return false;
	if (/\bGet-Acl\b/i.test(command)) return aclOutput(lines);
	const searchLine = numberedSearchLine(command);
	return searchLine !== undefined && lines.every(searchLine);
}
