#!/usr/bin/env bun
/** Regression test for the credential-disclosure gate. */
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
const fixtureRoot = mkdtempSync(join(fixtureParent, 'credential-disclosure-'));

/** A doubled backslash, built rather than typed so no round of escaping can eat it. */
const WIN_SEP = String.fromCharCode(92).repeat(2);

/** Stands in for a real credential. The gate must never echo it, so every run is checked. */
const FAKE_SECRET = 'fixture-value-that-must-never-be-printed';

function write(relativePath: string, lines: string[]): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
}

function remove(relativePath: string): void {
	rmSync(join(fixtureRoot, relativePath), { force: true, recursive: true });
}

function runCheck(...extra: string[]): RunResult {
	const result = Bun.spawnSync(
		['bun', 'run', 'check:credential-disclosure', '--', '--root', fixtureRoot, ...extra],
		{ cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' },
	);
	const output = `${result.stdout.toString()}${result.stderr.toString()}`;
	// Asserted on every run rather than once: a detector that quoted its evidence would republish
	// the credential into whatever reads the gate output, which is the failure it exists to stop.
	assert(
		!output.includes(FAKE_SECRET),
		`The gate must never echo a credential value:\n${output}`,
	);
	return { exitCode: result.exitCode, output };
}

/** A tool result long enough to clear the gate's minimum-content threshold. */
function payload(body: string): string {
	return `{"type":"tool_result","tool":"read_file","result":"${body}"}`;
}

function call(path: string): string {
	return `{"type":"tool_call","tool":"read_file","args":{"path":"${path}"}}`;
}

try {
	// An empty corpus is the fresh-clone and CI case: both scan roots are gitignored, so there is
	// legitimately nothing to look at. That skips rather than passing vacuously or failing.
	let result = runCheck();
	assert(result.exitCode === 0, `An empty corpus must exit 0:\n${result.output}`);
	assert(result.output.includes('[SKIP]'), `An empty corpus must skip:\n${result.output}`);

	// Reads that are not disclosures: a non-credential path, the project config (which carries no
	// credentials and is read constantly), and a credential path whose result came back empty.
	write('data/run-logs/clean.log', [
		call('src/index.ts'),
		payload('export const x = 1; // ordinary source, nothing sensitive here at all'),
		call('.aidd/aidd.config.json'),
		payload('{applicationsRoot:D:/applications,maxIterations:40,noClean:false}'),
		call('~/.aidd/config.json'),
		'{"type":"tool_result","tool":"read_file","result":""}',
	]);
	result = runCheck();
	assert(result.exitCode === 0, `A clean corpus must pass:\n${result.output}`);
	assert(
		result.output.includes('1 artifact(s) scanned'),
		`A passing run must state its examined count:\n${result.output}`,
	);

	// The disclosure itself, in the split shape the native and Claude protocols use: the path is
	// named on the call line and the content arrives on the next result line.
	write('.aidd/iterations/leak.log', [
		call(['C:', 'Users', 'me', '.aidd', 'config.json'].join(WIN_SEP)),
		payload(`{web:{authToken:${FAKE_SECRET}},applicationsRoot:D:/applications}`),
	]);
	result = runCheck();
	assert(result.exitCode === 1, `A disclosure must fail:\n${result.output}`);
	assert(
		result.output.includes('.aidd/iterations/leak.log:1'),
		`The finding must name the file and line:\n${result.output}`,
	);
	assert(
		result.output.includes('aidd user config'),
		`The finding must name which credential store matched:\n${result.output}`,
	);
	assert(
		result.output.includes('2 artifact(s) scanned'),
		`A failing run must state its examined count:\n${result.output}`,
	);

	// Codex packs the command and its output into one record, so a single line proves disclosure.
	remove('.aidd/iterations/leak.log');
	write('.aidd/iterations/codex.log', [
		'{"type":"command_execution","command":"cat ~/.ssh/id_ed25519","status":"completed",' +
			`"aggregated_output":"-----BEGIN OPENSSH PRIVATE KEY-----${FAKE_SECRET}"}`,
	]);
	result = runCheck();
	assert(result.exitCode === 1, `A same-line disclosure must fail:\n${result.output}`);
	assert(
		result.output.includes('ssh private key material'),
		`The finding must name the ssh store:\n${result.output}`,
	);

	// Baselining accepts what has already happened, and the accepted set then passes.
	result = runCheck('--update-baseline');
	assert(result.exitCode === 0, `Baselining must succeed:\n${result.output}`);
	assert(
		result.output.includes('1 disclosing file(s) of 2 artifact(s)'),
		`Baselining must report what it recorded:\n${result.output}`,
	);
	result = runCheck();
	assert(result.exitCode === 0, `A baselined corpus must pass:\n${result.output}`);
	assert(
		result.output.includes('1 known-disclosing file(s) baselined, 0 new'),
		`A baselined pass must say how much it is tolerating:\n${result.output}`,
	);

	// A new disclosure is not covered by the baseline, which is the whole point of the gate.
	write('data/run-logs/new-leak.log', [
		call('~/.aws/credentials'),
		payload(`[default] aws_secret_access_key = ${FAKE_SECRET}`),
	]);
	result = runCheck();
	assert(
		result.exitCode === 1,
		`A new disclosure must fail past the baseline:\n${result.output}`,
	);
	assert(
		result.output.includes('data/run-logs/new-leak.log'),
		`The finding must name the new file:\n${result.output}`,
	);
	assert(
		!result.output.includes('codex.log'),
		`A baselined file must not be re-reported:\n${result.output}`,
	);
	remove('data/run-logs/new-leak.log');

	// A waiver that has started passing is a finding against the waiver, so the list only shrinks.
	remove('.aidd/iterations/codex.log');
	write('.aidd/iterations/replacement.log', ['{"type":"tool_call","tool":"read_file"}']);
	result = runCheck();
	assert(result.exitCode === 1, `A stale baseline entry must fail:\n${result.output}`);
	assert(
		result.output.includes('no longer discloses'),
		`The finding must say the entry went stale:\n${result.output}`,
	);

	// A reasonless waiver is indistinguishable from an oversight, so the gate refuses to run.
	writeFileSync(
		join(fixtureRoot, '.aidd/evidence/credential-disclosure-baseline.json'),
		JSON.stringify({ files: [], generatedAt: '', reason: '  ' }),
		'utf8',
	);
	result = runCheck();
	assert(result.exitCode === 2, `A reasonless baseline must exit 2:\n${result.output}`);

	result = runCheck('--unknown');
	assert(result.exitCode === 2, `An unknown argument must exit 2:\n${result.output}`);

	console.log(`[OK] Credential disclosure test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
