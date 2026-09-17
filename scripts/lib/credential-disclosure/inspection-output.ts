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
	const search = /(?:^|[\s"'])rg\s+-n\b/.exec(command);
	if (!search) return false;
	const searchArguments = command.slice(search.index + search[0].length);
	// These switches remove or rewrite the filename provenance used below.
	if (
		/(?:^|\s)(?:--(?:no-filename|replace|only-matching|json)|-[A-Za-z]*[hor][A-Za-z]*)(?:\s|=|$)/.test(
			searchArguments,
		)
	)
		return false;
	return lines.every((line) => {
		const path = /^(.+?):\d+:/.exec(line)?.[1];
		return path !== undefined && credentialLabel(path) === undefined;
	});
}
