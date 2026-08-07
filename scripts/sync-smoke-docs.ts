#!/usr/bin/env bun
/**
 * Keeps the step lists in scripts/smoke-qc.md in sync with the registry in
 * scripts/lib/smoke-qc/steps.ts.
 *
 *   bun scripts/sync-smoke-docs.ts           # rewrite the lists
 *   bun scripts/sync-smoke-docs.ts --check   # fail if they drifted
 *
 * smoke-qc.md is the operator runbook for the gate. Generating the step lists prevents them from
 * diverging from the registry the runner actually executes: a hand-maintained list describes a gate
 * that stopped existing several steps ago and nothing notices.
 *
 * spernakit reads its equivalent lists out of `scripts/smoke.json`. Here the registry stays
 * TypeScript, because `FAST_QC_STEPS` validates the fast subset against the full list at module
 * load and JSON would move that check to runtime for no gain -- aidd has one mode, not seven, and
 * no derived repository merges this file.
 *
 * Enforces: the step lists in `scripts/smoke-qc.md` match `scripts/lib/smoke-qc/steps.ts`. No
 * assertion ID: the catalog states no invariant over the runbook's contents.
 *
 * Only the numbered lists under each "Steps (in order):" line are generated; the prose around them
 * is left alone.
 */

import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { FAST_QC_STEPS, SMOKE_QC_STEPS, type SmokeQcStep } from './lib/smoke-qc/steps.ts';

const DOC_PATH = 'scripts/smoke-qc.md';

/** smoke-qc.md section heading -> the step list it documents. */
const SECTION_TO_STEPS: Record<string, SmokeQcStep[]> = {
	'Fast gate (`bun run smoke:qc:fast`)': FAST_QC_STEPS,
	'Full gate (`bun run smoke:qc`)': SMOKE_QC_STEPS,
};

function renderSteps(steps: SmokeQcStep[]): string {
	return steps
		.map((step, index) => {
			const description = step.description.trim().replace(/\.$/, '');
			return `${index + 1}. \`${step.command.join(' ')}\`\n    - ${description}.`;
		})
		.join('\n');
}

function syncDocument(markdown: string): string {
	const lines = markdown.split('\n');
	const output: string[] = [];
	let currentSteps: SmokeQcStep[] | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';

		const heading = /^##\s+(.*)$/.exec(line);
		if (heading) currentSteps = SECTION_TO_STEPS[heading[1]?.trim() ?? ''];

		output.push(line);
		if (line.trim() !== 'Steps (in order):' || currentSteps === undefined) continue;

		// Consume the existing list (through to the next heading) and emit a generated one.
		let cursor = index + 1;
		while (cursor < lines.length && !/^#{2,3}\s/.test(lines[cursor] ?? '')) cursor += 1;

		output.push('', renderSteps(currentSteps), '');
		index = cursor - 1;
	}

	return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function runSmokeDocs(
	options: { check?: boolean; root?: string } = {},
): Promise<number> {
	const root = options.root ?? cwd();
	const docFile = join(root, DOC_PATH);

	const markdown = await Bun.file(docFile).text();
	const synced = syncDocument(markdown);

	if (options.check !== true) {
		await Bun.write(docFile, synced);
		console.log(`[OK] wrote ${DOC_PATH}`);
		return 0;
	}

	if (synced !== markdown) {
		console.error(`${DOC_PATH} is out of sync with scripts/lib/smoke-qc/steps.ts.`);
		console.error('The runbook describes steps the gate does not run, or omits ones it does.');
		console.error('Run `bun run smoke:docs` and commit the result.');
		console.error(`[FAIL] ${DOC_PATH} does not match the smoke:qc registry.`);
		return 1;
	}

	console.log(`[OK] ${DOC_PATH} matches the smoke:qc registry.`);
	return 0;
}

if (import.meta.main) {
	// A mistyped flag has to exit 2, not 1: `--chek` silently rewriting the runbook is the failure
	// this parser exists to stop, and reporting it as "one finding" would read as real drift.
	let check = false;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { check: { type: 'boolean' } },
			strict: true,
		});
		check = values.check === true;
	} catch (err) {
		console.error(`[FAIL] sync-smoke-docs: ${(err as Error).message}`);
		console.error('Usage: sync-smoke-docs [--check]');
		exit(2);
	}
	exit(await runSmokeDocs({ check }));
}
