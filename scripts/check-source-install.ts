#!/usr/bin/env bun
/**
 * check-source-install.ts
 *
 * Install the release artifact the way a user does, and fail the build if what comes out cannot
 * serve the control panel.
 *
 * aidd ships as source. The published artifact is the archive GitHub generates from the tag, which
 * carries no `.git` and no `frontend/dist`, and the only thing that turns it into a runnable panel
 * is the root `postinstall` hook. Every part of that lifecycle -- the hook, the frontend build, and
 * the build's need for a revision it can no longer read from Git -- is invisible to a unit test
 * with a stubbed builder, which is what the release workflow used to run. This gate exports the
 * tracked tree, runs a real `bun install --frozen-lockfile` in it, and asserts on the build output.
 *
 * Enforces: the tracked source tree installs into a complete control panel build. No assertion ID;
 * this is a release-artifact invariant rather than a catalog rule.
 *
 * Deliberately outside `smoke:qc`: one run downloads the dependency tree and builds the frontend
 * from scratch, which is minutes, not seconds. It belongs to the release workflow.
 *
 * Run: bun run check:source-install [--rev <tree-ish>] [--keep]
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';
import { findMissingDistAssets } from './postinstall.ts';

/** Variables that would let the install skip the very work this gate exists to observe. */
const CLEARED_VARS = ['AIDD_BUILD_REVISION', 'AIDD_SKIP_POSTINSTALL_BUILD'];

/** Intermediate archive, removed before the install so it cannot be mistaken for a source file. */
const TARBALL = 'source.tar';

export interface SourceInstallOptions {
	/** Leave the export in place for inspection after a failure. */
	keep?: boolean | undefined;
	/** Tree-ish to export. `HEAD` is what a tag publishes. */
	rev?: string | undefined;
	root?: string | undefined;
}

export interface SourceInstallResult {
	/** Files emitted under `frontend/dist`. */
	examined: number;
	/** Where the export lived, for the failure message. */
	exportDir: string;
	findings: string[];
}

function run(
	command: string[],
	options: { cwd: string; env?: Record<string, string | undefined> },
): {
	code: number;
	stderr: string;
} {
	const spawned = Bun.spawnSync(command, {
		cwd: options.cwd,
		env: options.env ?? (process.env as Record<string, string | undefined>),
		stderr: 'pipe',
		stdout: 'inherit',
		windowsHide: true,
	});
	return { code: spawned.exitCode, stderr: spawned.stderr.toString().trim() };
}

/** Every file under `dir`, repo-relative and POSIX-slashed. */
export function listFiles(dir: string, prefix = ''): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), relativePath));
		else out.push(relativePath);
	}
	return out;
}

/**
 * Unpack the tracked tree at `rev` into `into`.
 *
 * `git archive` is the same mechanism GitHub's source archives use, so the export honours
 * `export-ignore` and `export-subst` exactly as the published artifact does -- including the
 * `.build-revision` substitution the frontend build depends on outside a checkout.
 */
export function exportSource(root: string, rev: string, into: string): void {
	const dir = join(into, 'export');
	const tarball = join(dir, TARBALL);
	mkdirSync(dir, { recursive: true });

	const archive = run(['git', 'archive', '--format=tar', `--output=${tarball}`, rev], {
		cwd: root,
	});
	if (archive.code !== 0) {
		throw new Error(`git archive ${rev} exited ${archive.code}: ${archive.stderr}`);
	}

	// The tarball is extracted by its bare name from inside the export: the GNU tar that ships
	// with Git for Windows reads `C:\...` as a remote host and refuses an absolute Windows path.
	const extract = run(['tar', '-xf', TARBALL], { cwd: dir });
	if (extract.code !== 0) {
		throw new Error(`tar -xf ${TARBALL} exited ${extract.code}: ${extract.stderr}`);
	}
	rmSync(tarball);
}

/** The install environment: the caller's, minus the opt-outs a release must not inherit. */
export function installEnv(env: Record<string, string | undefined>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (CLEARED_VARS.includes(key) || value === undefined) continue;
		out[key] = value;
	}
	return out;
}

/** Assertions about the build the install produced. */
export function inspectBuild(exportDir: string): { examined: number; findings: string[] } {
	const findings: string[] = [];
	const distDir = join(exportDir, 'frontend', 'dist');
	if (!existsSync(join(distDir, 'index.html'))) {
		return { examined: 0, findings: ['frontend/dist/index.html: absent after the install'] };
	}

	const files = listFiles(distDir);
	for (const missing of findMissingDistAssets(distDir)) {
		findings.push(`frontend/dist/${missing}: referenced by index.html but never written`);
	}
	if (!files.some((file) => file.endsWith('.js'))) {
		findings.push('frontend/dist: the build emitted no JavaScript');
	}
	if (!files.some((file) => file.endsWith('.css'))) {
		findings.push('frontend/dist: the build emitted no stylesheet');
	}
	return { examined: files.length, findings };
}

export async function collectSourceInstall(
	options: SourceInstallOptions = {},
): Promise<SourceInstallResult> {
	const root = options.root ?? cwd();
	const rev = options.rev ?? 'HEAD';
	const workDir = await mkdtemp(join(tmpdir(), 'aidd-source-install-'));
	const exportDir = join(workDir, 'export');

	try {
		exportSource(root, rev, workDir);

		// A dist that arrived in the archive would make the rest of this gate vacuous: it would
		// pass whether or not the install still builds anything.
		if (existsSync(join(exportDir, 'frontend', 'dist'))) {
			return {
				examined: 0,
				exportDir,
				findings: [
					'frontend/dist: present in the export; the archive must ship sources only',
				],
			};
		}

		const install = run(['bun', 'install', '--frozen-lockfile'], {
			cwd: exportDir,
			env: installEnv(process.env as Record<string, string | undefined>),
		});
		if (install.code !== 0) {
			const detail = install.stderr === '' ? '' : ` -- ${install.stderr.split('\n').at(-1)}`;
			return {
				examined: 0,
				exportDir,
				findings: [`bun install --frozen-lockfile: exited ${install.code}${detail}`],
			};
		}

		return { exportDir, ...inspectBuild(exportDir) };
	} finally {
		if (options.keep !== true) await removeTempTree(workDir);
	}
}

export async function runSourceInstall(options: SourceInstallOptions = {}): Promise<number> {
	let result: SourceInstallResult;
	try {
		result = await collectSourceInstall(options);
	} catch (err) {
		console.error(`[FAIL] check:source-install: ${err instanceof Error ? err.message : err}`);
		return 2;
	}

	if (result.findings.length > 0) {
		for (const finding of result.findings) console.error(`- ${finding}`);
		console.log(
			`[FAIL] check:source-install: the ${options.rev ?? 'HEAD'} source archive does not ` +
				`install into a runnable panel (${result.findings.length} finding(s))`,
		);
		return 1;
	}

	console.log(
		`[OK] check:source-install: the ${options.rev ?? 'HEAD'} source archive installs and ` +
			`builds; ${result.examined} file(s) examined under frontend/dist`,
	);
	return 0;
}

if (import.meta.main) {
	let values: { keep?: boolean | undefined; rev?: string | undefined };
	try {
		values = parseArgs({
			args: Bun.argv.slice(2),
			options: { keep: { type: 'boolean' }, rev: { type: 'string' } },
			strict: true,
		}).values;
	} catch (err) {
		console.error('[FAIL] usage: bun run check:source-install [--rev <tree-ish>] [--keep]');
		console.error(`- ${err instanceof Error ? err.message : err}`);
		exit(2);
	}
	exit(await runSourceInstall(values));
}
