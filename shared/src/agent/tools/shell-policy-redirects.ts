/**
 * Only literal output redirects qualify: /dev/null is a shell sink, not a workspace path.
 * Keep the complete word boundary so quoted suffixes and /dev/null/../x cannot borrow the
 * exception. Expansions, input redirects and ordinary arguments still face the usual checks.
 * Only bash separators end the word, not CR or Unicode whitespace (including at string end).
 */
const NULL_OUTPUT_REDIRECT =
	/^(?:&>>?|>>?)[\t ]*(?:\/dev\/null|"\/dev\/null"|'\/dev\/null')(?![^\t \n;|&()<>])/;

/**
 * Give every policy pass the same view with null-output redirections replaced by spaces.
 * The original command is what runBash executes. Mask the whole redirect (including its fd)
 * so cp/mv/tee destination parsing still sees the command's actual arguments. Never exempt
 * /dev/null in general containment: rm /dev/null and cp file /dev/null must remain denied.
 */
export function maskNullOutputRedirects(command: string): string {
	let masked = '';
	let copiedThrough = 0;
	let wordStart = 0;
	let quote: '"' | "'" | null = null;

	for (let index = 0; index < command.length; index += 1) {
		const ch = command[index];
		// In bash, backslash escapes the next character outside single quotes. In particular,
		// an escaped quote or > must not change whether a later > is considered shell syntax.
		if (ch === '\\' && quote !== "'") {
			index += 1;
			continue;
		}
		if (quote !== null) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}

		if ((ch === '>' || ch === '&') && !/[<>]/.test(command[index - 1] ?? '')) {
			const match = NULL_OUTPUT_REDIRECT.exec(command.slice(index));
			if (match !== null) {
				const start =
					ch === '>' && /^\d+$/.test(command.slice(wordStart, index)) ? wordStart : index;
				const end = index + match[0].length;
				masked += command.slice(copiedThrough, start) + ' '.repeat(end - start);
				copiedThrough = end;
				wordStart = end;
				index = end - 1;
				continue;
			}
		}
		if (ch !== undefined && /[\t \n;|&()<>]/.test(ch)) wordStart = index + 1;
	}
	return masked + command.slice(copiedThrough);
}
