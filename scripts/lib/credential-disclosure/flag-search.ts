import { credentialLabel } from './paths.ts';

/**
 * A numbered search of a credential file whose every returned line is a boolean setting.
 *
 * An audit that checks whether a feature is switched on greps one key out of the user config. The
 * file was opened, so the read is judged, but what came back decides whether anything was disclosed:
 * a line that reads `"useWorktrees": false` carries no credential, and a credential is never a JSON
 * boolean. The exception rests on the output, not on the pattern searched for, and it holds only
 * where each returned line can be attributed to its file. Anything it cannot attribute stays judged.
 */

/**
 * The only switches under which every returned line is `path:line:text`. An allowlist, because the
 * dangerous ones are easy to miss: context switches print neighbouring lines as `path-line-text`,
 * which would arrive unattributed, and others drop the filename or rewrite the text.
 */
const ATTRIBUTABLE_SWITCH = /^(?:-[nEFiwHsI]+|--line-number|-e|--)$/;

/** A later pipeline stage that only shortens lines or drops whole ones, keeping each line's start. */
function keepsLineStarts(stage: string[]): boolean {
	const [program, ...args] = stage;
	if (program === 'head' || program === 'tail') {
		return args.every((arg) => /^-(?:n\d*|\d+)$/.test(arg) || /^\d+$/.test(arg));
	}
	return program === 'cut' && args.length === 1 && /^-c1-\d+$/.test(args[0] ?? '');
}

const BOOLEAN_SETTING = /^\s*"[\w.-]+":\s*(?:true|false)\s*,?\s*$/;

/**
 * True when a `grep -n` or `rg -n` over two or more files returned, from every credential file it
 * named, nothing but boolean settings. `laterStages` are the pipeline stages after the search.
 */
export function searchReturnedOnlyFlags(
	executable: string,
	args: string[],
	fileOperands: string[],
	laterStages: string[][],
	output: unknown,
	/** Whether other commands ran beside the search and can account for unnumbered output. */
	otherCommandsRan: boolean,
): boolean {
	if (typeof output !== 'string') return false;
	if (executable !== 'grep' && executable !== 'rg') return false;
	// The filename prefix that attributes a line is only guaranteed with several files to search.
	if (fileOperands.length < 2) return false;
	if (!args.some((arg) => /^-[A-Za-z]*n[A-Za-z]*$/.test(arg) || arg === '--line-number')) {
		return false;
	}
	if (args.some((arg) => arg.startsWith('-') && !ATTRIBUTABLE_SWITCH.test(arg))) return false;
	if (!laterStages.every(keepsLineStarts)) return false;
	for (const line of output.split(/\r?\n/)) {
		const numbered = /^(.+?):\d+:(.*)$/.exec(line);
		if (numbered === null) {
			// A search on its own prints nothing but numbered lines, so a line it cannot have
			// printed is unexplained and fails closed. Beside other commands it is theirs.
			if (line.trim() !== '' && !otherCommandsRan) return false;
			continue;
		}
		if (credentialLabel(numbered[1] ?? '') === undefined) continue;
		if (!BOOLEAN_SETTING.test(numbered[2] ?? '')) return false;
	}
	return true;
}
