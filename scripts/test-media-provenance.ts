#!/usr/bin/env bun
/** Regression test for the distributed-media provenance gate. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

interface RunResult {
	exitCode: number;
	output: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks += 1;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'media-provenance-'));

function write(relativePath: string, bytes: Uint8Array): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, bytes);
}

function runCheck(...extra: string[]): RunResult {
	const result = Bun.spawnSync(
		['bun', 'run', 'check:media-provenance', '--', '--root', fixtureRoot, ...extra],
		{ cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' },
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

try {
	write('docs/assets/clean.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
	let result = runCheck();
	assert(result.exitCode === 0, `A clean media fixture must pass:\n${result.output}`);
	assert(
		result.output.includes('1 distributed media file(s) examined'),
		`A passing run must report its examined count:\n${result.output}`,
	);

	write(
		'frontend/public/marked.webp',
		Buffer.from('RIFF caBX c2pa jumbf JUMBF c2pa.watermarked', 'ascii'),
	);
	result = runCheck();
	assert(result.exitCode === 1, `A marked media fixture must fail:\n${result.output}`);
	for (const marker of ['caBX', 'c2pa', 'jumbf', 'JUMBF', 'c2pa.watermarked']) {
		assert(
			result.output.includes(marker),
			`The finding must name ${marker}:\n${result.output}`,
		);
	}

	// The GitHub Pages root ships straight to the public site without passing through a build,
	// so a marked image that only lives there must still fail the gate by name.
	rmSync(join(fixtureRoot, 'frontend'), { force: true, recursive: true });
	write('site/og-image.jpg', Buffer.from('JFIF c2pa.watermarked caBX', 'ascii'));
	result = runCheck();
	assert(result.exitCode === 1, `A marked Pages fixture must fail:\n${result.output}`);
	assert(
		result.output.includes('site/og-image.jpg'),
		`The finding must name the Pages path:\n${result.output}`,
	);
	assert(
		result.output.includes('c2pa.watermarked'),
		`The finding must name the Pages marker:\n${result.output}`,
	);
	assert(
		result.output.includes('2 distributed media file(s)'),
		`The Pages root must be counted as examined:\n${result.output}`,
	);

	rmSync(join(fixtureRoot, 'docs'), { force: true, recursive: true });
	rmSync(join(fixtureRoot, 'site'), { force: true, recursive: true });
	result = runCheck();
	assert(
		result.exitCode === 1 && result.output.includes('examined no distributed media files'),
		`A vacuous run must fail:\n${result.output}`,
	);

	result = runCheck('--unknown');
	assert(result.exitCode === 2, `An unknown argument must exit 2:\n${result.output}`);

	console.log(`[OK] Media provenance test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
