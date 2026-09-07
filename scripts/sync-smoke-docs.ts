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

/**
 * Rewrite each section's step list from the registry, and report which sections were rewritten.
 *
 * The caller needs that second half. Section tracking is cleared by any `##` heading, so a new
 * top-level heading inserted between a section and its `Steps (in order):` line silently detaches
 * the list: nothing is replaced, the synced text equals the input, and `--check` compares identical
 * strings and passes. That happened -- a `## Wall time` section was added under the full gate, and
 * the full-gate list then drifted out of order unnoticed until a new step failed to appear. A
 * section that rendered nothing is now a failure rather than a silent pass.
 */
function syncDocument(markdown: string): { rendered: Set<string>; text: string } {
	const lines = markdown.split('\n');
	const output: string[] = [];
	const rendered = new Set<string>();
	let currentSteps: SmokeQcStep[] | undefined;
	let currentSection = '';

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';

		const heading = /^##\s+(.*)$/.exec(line);
		if (heading) {
			currentSection = heading[1]?.trim() ?? '';
			currentSteps = SECTION_TO_STEPS[currentSection];
		}

		output.push(line);
		if (line.trim() !== 'Steps (in order):' || currentSteps === undefined) continue;

		// Consume the existing list (through to the next heading) and emit a generated one.
		let cursor = index + 1;
		while (cursor < lines.length && !/^#{2,3}\s/.test(lines[cursor] ?? '')) cursor += 1;

		output.push('', renderSteps(currentSteps), '');
		rendered.add(currentSection);
		index = cursor - 1;
	}

	return { rendered, text: output.join('\n').replace(/\n{3,}/g, '\n\n') };
}

/** Sections the registry defines that the document gave the renderer no list to rewrite. */
function detachedSections(rendered: Set<string>): string[] {
	return Object.keys(SECTION_TO_STEPS).filter((section) => !rendered.has(section));
}

export async function runSmokeDocs(
	options: { check?: boolean; root?: string } = {},
): Promise<number> {
	const root = options.root ?? cwd();
	const docFile = join(root, DOC_PATH);

	const markdown = await Bun.file(docFile).text();
	const { rendered, text: synced } = syncDocument(markdown);

	// Checked before the comparison below, which cannot see this failure: a detached section is
	// rewritten to itself, so the synced text matches and `--check` would report a clean pass.
	const detached = detachedSections(rendered);
	if (detached.length > 0) {
		for (const section of detached) {
			console.error(`- ${DOC_PATH} section "${section}" has no reachable step list`);
		}
		console.error(
			'A `##` heading between the section and its `Steps (in order):` line detaches the list, ' +
				'and a detached list is never regenerated or checked. Make it a `###` subsection.',
		);
		console.error(`[FAIL] ${DOC_PATH}: ${detached.length} section(s) documented nothing.`);
		return 1;
	}

	if (options.check !== true) {
		await Bun.write(docFile, synced);
		console.log(`[OK] wrote ${DOC_PATH} -- ${rendered.size} section(s) rendered.`);
		return 0;
	}

	if (synced !== markdown) {
		console.error(`${DOC_PATH} is out of sync with scripts/lib/smoke-qc/steps.ts.`);
		console.error('The runbook describes steps the gate does not run, or omits ones it does.');
		console.error('Run `bun run smoke:docs` and commit the result.');
		console.error(`[FAIL] ${DOC_PATH} does not match the smoke:qc registry.`);
		return 1;
	}

	console.log(
		`[OK] ${DOC_PATH} matches the smoke:qc registry -- ${rendered.size} section(s) checked.`,
	);
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
