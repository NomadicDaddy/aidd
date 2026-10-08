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
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import type { Hit, RootScan } from './lib/advisory-sweep/scan.ts';

import { appendRowOnce, formatRow, type SweepResult } from './lib/advisory-sweep/row.ts';
import { matchFile, scanRoot } from './lib/advisory-sweep/scan.ts';

const DEFAULT_ROOTS = ['D:\\applications', 'D:\\infra', 'D:\\public', 'D:\\scripts'];
const DEFAULT_SWEEPS_FILE = 'D:\\infra\\advisory-sweeps.md';
// The sweeps file's header names @ianvs/prettier-plugin-sort-imports as the control, but in the
// estate that name occurs only as a peerDependency key inside another package's lockfile entry, so
// an exact match cannot find it and every sweep that reported it found was matching substrings.
// prettier-plugin-tailwindcss is a resolved entry in several lockfiles.
const DEFAULT_CONTROL = 'prettier-plugin-tailwindcss';

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
	toolCheck: string;
}): Promise<SweepResult> {
	const roots: RootScan[] = [];
	const hits: { hit: Hit; root: string }[] = [];
	let controlFile: null | string = null;
	const names = [...new Set(options.packages)].sort();
	for (const root of options.roots) {
		const scan = await scanRoot(root);
		roots.push(scan);
		for (const file of scan.files) {
			for (const hit of await matchFile(file, names)) hits.push({ hit, root });
			if (controlFile === null && (await matchFile(file, [options.control])).length > 0)
				controlFile = file;
		}
	}
	return {
		control: { file: controlFile, name: options.control },
		date: options.date,
		hits,
		packages: names,
		query: options.query,
		roots,
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
	const result = await runSweep({
		control: values.control ?? DEFAULT_CONTROL,
		date: values.date ?? localDate(),
		packages,
		query: values.query.trim(),
		roots: values.root && values.root.length > 0 ? values.root : DEFAULT_ROOTS,
		toolCheck: values['tool-check'] ?? 'did not apply',
	});
	const row = formatRow(result);
	console.log(row);
	const filesRead = result.roots.reduce((sum, scan) => sum + scan.files.length, 0);
	if (filesRead === 0) {
		console.error(
			'No manifest or lockfile was read; the row is the FAILED form and was not appended.',
		);
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
