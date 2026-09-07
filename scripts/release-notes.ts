/**
 * Release version parity and release-notes rendering.
 *
 * Enforces: VERSION, the root package.json version, and the top `## [x.y.z]` heading in
 * docs/CHANGELOG.md all name the same version before a tag is cut. No assertion ID: the catalog
 * states no invariant over release metadata.
 *
 * `--check` validates parity only. Without it the script also writes the release notes the
 * Release workflow attaches to the GitHub release. aidd ships as source, so this is the whole of
 * release packaging: GitHub generates the source archives from the tag itself.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import {
	assertVersionParity,
	errorMessage,
	formatReleaseNotes,
	readVersionInfo,
} from './lib/release/common.ts';

const OUTPUT_DIR = 'dist/release';
const OUTPUT_FILE = 'release-notes.md';

export async function runReleaseNotes(rootDir = cwd(), checkOnly = false): Promise<number> {
	try {
		const info = await readVersionInfo(rootDir);
		const issues = assertVersionParity(info);
		if (issues.length > 0) {
			console.error('[FAIL] release version parity:');
			for (const issue of issues) console.error(`- ${issue}`);
			return 1;
		}
		if (checkOnly) {
			console.log(
				`[OK] release version parity -- VERSION, package.json, and CHANGELOG agree on ${info.packageVersion}`,
			);
			return 0;
		}
		const outputDir = join(rootDir, OUTPUT_DIR);
		await mkdir(outputDir, { recursive: true });
		const target = join(outputDir, OUTPUT_FILE);
		await Bun.write(target, formatReleaseNotes(info));
		console.log(`[OK] Wrote ${OUTPUT_DIR}/${OUTPUT_FILE} for v${info.packageVersion}`);
		return 0;
	} catch (err) {
		console.error(`[FAIL] ${errorMessage(err)}`);
		return 2;
	}
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { check: { type: 'boolean' } }, strict: true });
	exit(await runReleaseNotes(cwd(), values.check === true));
}
