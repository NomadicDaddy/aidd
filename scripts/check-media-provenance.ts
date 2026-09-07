#!/usr/bin/env bun
/**
 * Rejects machine-readable C2PA/JUMBF provenance in distributed raster media.
 *
 * Enforces: QUAL-001 (aidd) -- smoke:qc is the canonical local quality gate, including the
 * distributed-media provenance policy it promises to release consumers.
 *
 * Run: bun run check:media-provenance [--root <dir>]
 */
import { resolve } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { scanDistributedMedia } from './lib/media-provenance/scan.ts';

export async function runMediaProvenance(projectRoot = cwd()): Promise<number> {
	let report;
	try {
		report = await scanDistributedMedia(resolve(projectRoot));
	} catch (err) {
		console.error(
			`[FAIL] check:media-provenance could not run: ${err instanceof Error ? err.message : String(err)}`,
		);
		return 2;
	}

	if (report.examined === 0) {
		console.error('[FAIL] check:media-provenance examined no distributed media files.');
		return 1;
	}

	if (report.findings.length > 0) {
		for (const finding of report.findings) {
			console.error(
				`- ${finding.path}:byte ${finding.offset} contains provenance marker ${finding.marker}`,
			);
		}
		console.log(
			`[FAIL] check:media-provenance -- ${report.findings.length} marker(s) in ` +
				`${report.examined} distributed media file(s).`,
		);
		return 1;
	}

	console.log(
		`[OK] check:media-provenance -- ${report.examined} distributed media file(s) examined; ` +
			'no C2PA/JUMBF provenance markers found.',
	);
	return 0;
}

if (import.meta.main) {
	let root: string | undefined;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { root: { type: 'string' } },
			strict: true,
		});
		root = values.root;
	} catch (err) {
		console.error(
			`[FAIL] check:media-provenance: ${err instanceof Error ? err.message : String(err)}`,
		);
		console.error('[FAIL] Usage: check:media-provenance [--root <dir>]');
		exit(2);
	}
	exit(await runMediaProvenance(root));
}
