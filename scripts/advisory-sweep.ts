#!/usr/bin/env bun
/**
 * advisory-sweep.ts
 *
 * The daily digest's advisory lockfile check as one deterministic step: walks the duty's four
 * roots for manifests and lockfiles (never node_modules), matches each package the advisories
 * named as a dependency key or lockfile entry (never a substring), proves the match with a
 * positive control, prints the one row the directive's step 11e specifies, and with --append
 * records it exactly once. A rerun on the same day with the same query prints the existing row
 * and writes nothing, so a corrected run cannot stack rows the way three did on 2026-10-08.
 *
 * Reads and reports only. The sweeps file belongs to D:\infra's owner, who commits it.
 *
 * Run: bun run advisory:sweep -- --query "<result and window>" [--packages a,b] [--append]
 *      [--tool-check "<done: … | did not apply>"] [--root <dir>]... [--sweeps-file <path>]
 */
import { resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import type { Hit } from './lib/advisory-sweep/scan.ts';

import {
	appendRowOnce,
	describeScope,
	filesCovered,
	formatRow,
	type SkippedRoot,
	type SweepResult,
	type SweptRoot,
} from './lib/advisory-sweep/row.ts';
import { matchFile, scanRoot } from './lib/advisory-sweep/scan.ts';

// Every repo-holding root (Phillip #8053). D:\amiga is not an application root, but it carries
// an npm install surface of its own, so it is swept like the rest.
const DEFAULT_ROOTS = ['D:\\amiga', 'D:\\applications', 'D:\\infra', 'D:\\scripts'];
const DEFAULT_SWEEPS_FILE = 'D:\\infra\\advisory-sweeps.md';
// The control must be findable the way a real finding is: a declaration or a resolved lockfile
// entry of its own. The earlier control, @ianvs/prettier-plugin-sort-imports, occurs only inside
// another package's peer list, so only a substring match ever found it (the sweeps file's header
// records why). prettier-plugin-tailwindcss is a resolved entry in several lockfiles.
const DEFAULT_CONTROL = 'prettier-plugin-tailwindcss';

/**
 * The roots a sweep reads, and each default root an explicit --root selection leaves out. A
 * narrowed sweep still has to say which repo-holding roots it skipped and why (#8053), or its row
 * reads as complete coverage. Both sides are typed paths, so they are compared case-insensitively
 * after resolving rather than through the filesystem.
 * @param chosen The --root values, or undefined when none were given.
 * @returns The roots to sweep and the default roots skipped with their reason.
 */
export function selectRoots(chosen: readonly string[] | undefined): {
	roots: readonly string[];
	skipped: SkippedRoot[];
} {
	if (chosen === undefined || chosen.length === 0) return { roots: DEFAULT_ROOTS, skipped: [] };
	const key = (root: string): string => resolve(root).toLowerCase();
	const picked = new Set(chosen.map(key));
	return {
		roots: chosen,
		skipped: DEFAULT_ROOTS.filter((root) => !picked.has(key(root))).map((root) => ({
			reason: 'not selected by --root',
			root,
		})),
	};
}

function localDate(): string {
	const now = new Date();
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Runs the sweep over the given roots.
 * @param options What to sweep and for which packages.
 * @returns The sweep result, including the control's location or null when it was not found.
 */
export async function runSweep(options: {
	control: string;
	date: string;
	packages: readonly string[];
	query: string;
	roots: readonly string[];
	skipped?: readonly SkippedRoot[];
	toolCheck: string;
}): Promise<SweepResult> {
	const roots: SweptRoot[] = [];
	const hits: { hit: Hit; root: string }[] = [];
	let controlFile: null | string = null;
	const names = [...new Set(options.packages)].sort();
	for (const root of options.roots) {
		const scan = await scanRoot(root);
		const failed: SweptRoot['failed'] = [];
		for (const file of scan.files) {
			// One read answers both questions; a file that failed covers neither.
			const match = await matchFile(file, [...names, options.control]);
			if (match.failure !== null) {
				failed.push({ failure: match.failure, file });
				continue;
			}
			for (const hit of match.hits) {
				if (hit.name === options.control) controlFile ??= file;
				else hits.push({ hit, root });
			}
		}
		roots.push({ failed, scan });
	}
	return {
		control: { file: controlFile, name: options.control },
		date: options.date,
		hits,
		packages: names,
		query: options.query,
		roots,
		skipped: [...(options.skipped ?? [])],
		toolCheck: options.toolCheck,
	};
}

if (import.meta.main) {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			append: { type: 'boolean' },
			control: { type: 'string' },
			date: { type: 'string' },
			packages: { type: 'string' },
			query: { type: 'string' },
			root: { multiple: true, type: 'string' },
			'sweeps-file': { type: 'string' },
			'tool-check': { type: 'string' },
		},
		strict: true,
	});
	if (values.query === undefined || values.query.trim().length === 0) {
		console.error('--query is required: the advisory database result and window for the row.');
		exit(2);
	}
	const packages = (values.packages ?? '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => name.length > 0 && name !== 'none');
	const selection = selectRoots(values.root);
	const result = await runSweep({
		control: values.control ?? DEFAULT_CONTROL,
		date: values.date ?? localDate(),
		packages,
		query: values.query.trim(),
		roots: selection.roots,
		skipped: selection.skipped,
		toolCheck: values['tool-check'] ?? 'did not apply',
	});
	const row = formatRow(result);
	console.log(row);
	const filesRead = result.roots.reduce((sum, root) => sum + filesCovered(root), 0);
	if (filesRead === 0) {
		console.error(
			'No manifest or lockfile was read; the row is the FAILED form and was not appended.',
		);
		console.error(`Scope: ${describeScope(result)}`);
		exit(1);
	}
	if (result.control.file === null) {
		console.error(
			`Positive control ${result.control.name} was not found; a zero cannot be trusted.`,
		);
		exit(1);
	}
	if (values.append) {
		const outcome = await appendRowOnce(values['sweeps-file'] ?? DEFAULT_SWEEPS_FILE, row);
		if (outcome.written) console.error('Appended one row.');
		else {
			console.error('A row for this date and query is already on record; nothing written:');
			console.error(outcome.existing);
		}
	}
}
