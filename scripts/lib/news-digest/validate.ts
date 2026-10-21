/**
 * The checks a digest must pass before the run reports done: its advisory section exists, lists as
 * many GHSA lines as the count it states the API returned, and the advisory lockfile check carries
 * the day's sweep row. The digest agent used to write this check by hand each day with that day's
 * expected count typed into it.
 */

const ADVISORY_HEADING = '## Security advisories (npm)';
const LOCKFILE_HEADING = '## Advisory lockfile check';

function sectionLines(lines: string[], heading: string): null | string[] {
	const start = lines.findIndex((line) => line.trim() === heading);
	if (start < 0) return null;
	const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
	return lines.slice(start + 1, end < 0 ? lines.length : end);
}

function advisoryProblems(section: null | string[]): string[] {
	if (section === null) return [`missing "${ADVISORY_HEADING}" section`];
	const text = section.join('\n');
	const stated = /returned\s+\*\*(\d+)\*\*/i.exec(text)?.[1];
	if (stated === undefined) return ['advisory section does not state the count returned (**N**)'];
	const listed = section.filter((line) => /^\s*-\s.*GHSA-/.test(line)).length;
	if (listed !== Number(stated)) {
		return [`advisory section states ${stated} returned but lists ${listed} GHSA lines`];
	}
	return [];
}

function lockfileProblems(section: null | string[], day: string): string[] {
	if (section === null) return [`missing "${LOCKFILE_HEADING}" section`];
	const row = section.some((line) => line.trim().startsWith(`${day} | `));
	return row ? [] : [`lockfile check has no sweep row starting "${day} | "`];
}

/** Every problem found in a digest written on `day`; an empty list means it passes. */
export function validateDigest(text: string, day: string): string[] {
	const lines = text.split(/\r?\n/);
	return [
		...advisoryProblems(sectionLines(lines, ADVISORY_HEADING)),
		...lockfileProblems(sectionLines(lines, LOCKFILE_HEADING), day),
	];
}
