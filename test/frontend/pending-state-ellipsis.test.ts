import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (/\.tsx?$/.test(entry.name)) out.push(full);
	}
	return out;
}

/**
 * Verbs that name an operation the interface is still waiting on. A label built from one of
 * these is a pending state, and pending states are the copy that reaches for an ellipsis — so
 * this is the vocabulary where a three-period regression actually shows up on screen.
 */
const PENDING_VERB =
	'analyz|apply|build|check|connect|creat|delet|fetch|generat|import|install|launch|load|prepar|process|queu|refresh|resolv|sav|scan|send|start|stopp|submitt|sync|updat|upload|wait|work|running|pending';

/**
 * A quoted literal that names a pending operation and then trails off in three periods.
 *
 * The negated classes exclude newlines as well as quotes: without that, an opening quote on one
 * line and an unrelated one two lines down read as a single literal and the scan reports most of
 * the codebase. The three periods must sit immediately before the closing delimiter, which is
 * where pending copy puts them and is also what keeps `${fn({ ...query })}` inside a template
 * literal from reading as an ellipsis.
 */
const ASCII_PENDING_ELLIPSIS = new RegExp(
	String.raw`(['"\`])[^'"\`\n]*\b(?:${PENDING_VERB})[^'"\`\n]*\.\.\.\1`,
	'gi',
);

describe('pending-state copy uses a real ellipsis', () => {
	test('the two audited labels render …, not three periods', () => {
		const alertDialog = readFileSync(
			join(FRONTEND_SRC, 'components/ui/alert-dialog.tsx'),
			'utf-8',
		);
		const activeRuns = readFileSync(
			join(FRONTEND_SRC, 'pages/projects/detail/ActiveRunsPanel.tsx'),
			'utf-8',
		);

		expect(alertDialog).toContain("'Working…'");
		expect(alertDialog).not.toContain('Working...');
		expect(activeRuns).toContain("'Loading active runs…'");
		expect(activeRuns).not.toContain('Loading recent runs...');
	});

	test('no asynchronous status label anywhere in frontend/src trails off in ...', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(FRONTEND_SRC)) {
			const source = readFileSync(file, 'utf-8');
			for (const match of source.matchAll(ASCII_PENDING_ELLIPSIS)) {
				// Rest/spread syntax never appears inside a quoted literal, so anything the
				// pattern reaches here is real interface copy.
				offenders.push(`${file.slice(FRONTEND_SRC.length + 1)}: ${match[0]}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});
