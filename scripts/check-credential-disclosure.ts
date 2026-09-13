#!/usr/bin/env bun
/**
 * check-credential-disclosure.ts
 *
 * Detects retained agent artifacts that record a tool reading a credential-bearing file and
 * getting content back.
 *
 * Enforces: SEC-008 (aidd) -- retained run artifacts must not record an agent reading a credential
 * store, because a tool result is disclosed to the model provider at the moment it is produced and
 * cannot be recalled afterwards.
 *
 * This is deliberately a DIFFERENT check from secret scrubbing. The scrubber redacts credential
 * values out of the artifact written to disk, and it works: the disk copies are clean. But it runs
 * on the way to disk, after the tool result has already been sent upstream. A residue scan of the
 * artifacts therefore stays green through exactly the disclosure it is meant to catch -- this
 * repository holds artifacts that read `~/.aidd/config.json` in full while every on-disk copy
 * passes the residue scan.
 *
 * So this gate looks at SHAPE, not at content: did a tool read a path that holds credentials, and
 * did anything come back? A narrowly typed port preview is verified against its returned output;
 * credential values are never printed or hashed.
 *
 * Baseline-relative by design. The historical hits are a fact about artifacts already written;
 * failing on them forever would train everyone to ignore the gate. `--update-baseline` records the
 * current set under a mandatory reason, and a baselined file that has stopped disclosing is
 * reported so the list can only shrink. Both the artifacts and the baseline are gitignored, so
 * this is a local hygiene gate: in a fresh clone and in CI there is nothing to scan and it skips.
 *
 * Run: bun run check:credential-disclosure [--root <dir>] [--update-baseline]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import {
	BASELINE_PATH,
	collectDisclosures,
	loadBaseline,
	SCAN_ROOTS,
} from './lib/credential-disclosure/scan.ts';

const GATE = 'check:credential-disclosure';

const BASELINE_REASON =
	'Artifacts that already recorded a credential-bearing read before this gate existed. ' +
	'Rotate whatever they name, then baseline them. Do not add to this list to silence a new hit: ' +
	'a tool result reaches the model provider when it is produced, so a new entry is a disclosure ' +
	'that has already happened, not a tolerated style violation.';

export interface CredentialDisclosureOptions {
	root?: string | undefined;
	/** Record the current disclosing set as the accepted baseline instead of asserting against it. */
	updateBaseline?: boolean | undefined;
}

async function writeBaseline(root: string, files: string[]): Promise<void> {
	const path = join(root, BASELINE_PATH);
	await mkdir(dirname(path), { recursive: true });
	const baseline = { files, generatedAt: new Date().toISOString(), reason: BASELINE_REASON };
	await writeFile(path, `${JSON.stringify(baseline, null, '\t')}\n`, 'utf8');
}

/**
 * Run the gate. Returns the process exit code: 0 pass, 1 findings, 2 unexpected error.
 *
 * Zero artifacts is the one legitimate empty population -- both scan roots are gitignored, so a
 * fresh clone and CI have nothing to look at. That reports `[SKIP]` with the reason rather than a
 * vacuous pass, which is what rule 5 asks for.
 */
export async function runCredentialDisclosure(
	options: CredentialDisclosureOptions = {},
): Promise<number> {
	const root = resolve(options.root ?? join(import.meta.dir, '..'));

	try {
		const baseline = options.updateBaseline === true ? undefined : await loadBaseline(root);
		const report = await collectDisclosures(root, baseline);

		if (report.examined === 0) {
			console.log(
				`[SKIP] ${GATE} -- no retained artifacts under ${SCAN_ROOTS.join(' or ')}. ` +
					'Both are gitignored, so a fresh clone and CI have nothing to scan.',
			);
			return 0;
		}

		if (options.updateBaseline === true) {
			await writeBaseline(root, report.disclosing);
			console.log(
				`[OK] ${GATE} -- baseline recorded: ${report.disclosing.length} disclosing file(s) ` +
					`of ${report.examined} artifact(s) scanned.`,
			);
			return 0;
		}

		if (report.regressions.length > 0) {
			console.error(`[FAIL] ${GATE}: credential-bearing read(s) with a non-empty result.`);
			console.error(
				'A tool result reaches the model provider when it is produced; scrubbing the artifact ' +
					'afterwards does not undo that. Treat each as a disclosure of the named file, and ' +
					'rotate that credential before baselining it.',
			);
			for (const hit of report.regressions.slice(0, 50)) {
				console.error(`- ${hit.file}:${hit.line} read ${hit.label} and content came back`);
			}
			if (report.regressions.length > 50) {
				console.error(`- ... and ${report.regressions.length - 50} more`);
			}
			console.log(
				`[FAIL] ${GATE} -- ${report.regressions.length} new disclosure(s) across ` +
					`${report.examined} artifact(s) scanned.`,
			);
			return 1;
		}

		if (report.cleared.length > 0) {
			console.error(`[FAIL] ${GATE}: baselined file(s) that no longer disclose.`);
			console.error(
				`Remove them from ${BASELINE_PATH} so the list keeps shrinking. A waiver that has ` +
					'started passing is a finding against the waiver, not a tolerated entry.',
			);
			for (const file of report.cleared) console.error(`- ${file} no longer discloses`);
			console.log(
				`[FAIL] ${GATE} -- ${report.cleared.length} stale baseline entr(ies) across ` +
					`${report.examined} artifact(s) scanned.`,
			);
			return 1;
		}

		console.log(
			`[OK] ${GATE} -- ${report.examined} artifact(s) scanned, ` +
				`${report.disclosing.length} known-disclosing file(s) baselined, 0 new.`,
		);
		return 0;
	} catch (err) {
		console.error(`[FAIL] ${GATE} could not run: ${(err as Error).message}`);
		return 2;
	}
}

if (import.meta.main) {
	// `parseArgs` throws on an unknown flag, and an uncaught throw exits 1 -- the code rule 2
	// reserves for findings. A mistyped flag must not read as a disclosure.
	let options: CredentialDisclosureOptions;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				root: { type: 'string' },
				'update-baseline': { type: 'boolean' },
			},
			strict: true,
		});
		options = { root: values.root, updateBaseline: values['update-baseline'] };
	} catch (err) {
		console.error(`[FAIL] ${GATE}: ${(err as Error).message}`);
		console.error(`Usage: ${GATE} [--root <dir>] [--update-baseline]`);
		exit(2);
	}
	exit(await runCredentialDisclosure(options));
}
