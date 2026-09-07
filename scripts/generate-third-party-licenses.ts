/**
 * Generates the third-party documents from the installed dependency graph and the exact-path
 * distributed-materials registry.
 *
 *   bun scripts/generate-third-party-licenses.ts           # write the file
 *   bun scripts/generate-third-party-licenses.ts --check   # fail if it drifted
 *
 * The generated files are committed with the source tree and describe the dependency graph that
 * `bun install` resolves. --check runs in smoke:qc and CI to catch omissions and stale versions.
 *
 * Enforces: the committed third-party documents match what the installed dependency graph and the
 * distributed-materials registry generate. No assertion ID: the catalog states no invariant over
 * third-party notices.
 */

import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { collectLicensedClosure, summarizeClosure } from './lib/third-party-licenses/closure.ts';
import { collectDirectDependencies, workspaceNames } from './lib/third-party-licenses/collect.ts';
import {
	GROUPS,
	INTRO,
	NOTICES_INTRO,
	scopeSections,
} from './lib/third-party-licenses/documentSections.ts';
import { renderNotices } from './lib/third-party-licenses/notices-doc.ts';
import {
	renderRegistryNotices,
	renderRegistrySummary,
} from './lib/third-party-licenses/registry-render.ts';
import { loadDistributedMaterialsRegistry } from './lib/third-party-licenses/registry.ts';
import { formatMarkdown, render, unreviewedLicenses } from './lib/third-party-licenses/render.ts';

const WORKSPACES = ['backend', 'cli', 'frontend', 'shared'];
const OUTPUT = 'THIRD-PARTY-LICENSES.md';
const NOTICES_OUTPUT = 'THIRD-PARTY-NOTICES.md';

/**
 * Per-package analysis of what a copyleft/weak-copyleft package means for this project, keyed by
 * package name. A flagged package with no entry here fails the generator (see flaggedNoteFor).
 *
 * Each entry must describe the named package rather than relying on a generic claim. The next
 * copyleft package to arrive must fail this gate until someone reviews how aidd uses it. An empty
 * map is therefore correct and safe when the closure contains no flagged packages; a wrong one is
 * not.
 */
const FLAGGED_ANALYSIS: Record<string, string> = {};

/**
 * The analysis paragraph for the currently-flagged packages, or a hard failure.
 *
 * A copyleft package in the runtime closure is exactly the case a human has to reason about, so
 * the generator refuses to describe one it has no reviewed analysis for.
 */
function flaggedNoteFor(flagged: { license: string; name: string }[]): string {
	const unanalyzed = flagged.filter((entry) => !(entry.name in FLAGGED_ANALYSIS));
	if (unanalyzed.length > 0) {
		console.error('Copyleft/weak-copyleft package in the runtime closure with no analysis:');
		for (const entry of unanalyzed) console.error(`  - ${entry.name} (${entry.license})`);
		console.error('');
		console.error('Review how it is used and add an entry to FLAGGED_ANALYSIS in');
		console.error('scripts/generate-third-party-licenses.ts. Do not let the generator');
		console.error('publish a claim about a package nobody assessed.');
		exit(1);
	}
	return flagged.map((entry) => FLAGGED_ANALYSIS[entry.name]).join('\n\n');
}

interface GeneratedDocuments {
	notices: string;
	/**
	 * Runtime packages whose licenses were read. Rule 5's count for this gate.
	 *
	 * The closure is discovered from the lockfile, and the two documents are rendered from whatever
	 * it holds. An empty closure renders an empty appendix, which the committed empty appendix then
	 * matches, so `--check` reports parity between two documents that attribute nobody.
	 */
	packages: number;
	summary: string;
}

export async function generate(root: string): Promise<GeneratedDocuments> {
	const registry = await loadDistributedMaterialsRegistry(root);
	const thirdPartyMaterials = registry.classifications.thirdParty;
	const { dependencies, unresolved } = await collectDirectDependencies(root, WORKSPACES);

	if (unresolved.length > 0) {
		console.error('Cannot resolve installed package(s); run `bun install` first:');
		for (const entry of unresolved) console.error(`  - ${entry}`);
		exit(1);
	}

	const { closure, unresolved: unresolvedClosure } = await collectLicensedClosure(
		root,
		WORKSPACES,
		await workspaceNames(root, WORKSPACES),
	);

	// A runtime package we cannot locate is one whose license we never read. That is a hole in the
	// courtesy inventory, so it fails the generator rather than shrinking the appendix.
	if (unresolvedClosure.length > 0) {
		console.error('Cannot resolve packages in the runtime closure (run `bun install` first):');
		for (const entry of unresolvedClosure) console.error(`  - ${entry}`);
		exit(1);
	}

	// A license we have no reviewed notice for must not be summarized as if its obligations were
	// known. Fail loudly and add it to notices.ts deliberately.
	//
	// This gates the whole runtime closure, not just the direct dependencies. A transitive package
	// arriving under a new copyleft license — or under none at all, which `licenseOf` reports as
	// UNKNOWN — must not land as a quiet row in the inventory without review.
	const attributed = [...dependencies, ...closure];
	const unreviewed = unreviewedLicenses(attributed);
	if (unreviewed.length > 0) {
		console.error('Runtime package uses a license with no reviewed notice text:');
		for (const license of unreviewed) {
			const users = attributed
				.filter((entry) => entry.license === license)
				.map((entry) => entry.name)
				.sort();
			console.error(`  - ${license} (${[...new Set(users)].join(', ')})`);
		}
		console.error(
			'Add it to scripts/lib/third-party-licenses/notices.ts after reviewing its terms.',
		);
		exit(1);
	}

	const graph = summarizeClosure(closure);

	const summary = render({
		dependencies,
		flaggedNote: flaggedNoteFor(graph.flagged),
		graph,
		groups: GROUPS,
		intro: INTRO,
		nonPackageSummary: renderRegistrySummary(thirdPartyMaterials),
		scopeSections: scopeSections(),
		title: 'Third-Party Licenses',
	});

	const notices = renderNotices({
		closure,
		intro: NOTICES_INTRO,
		nonPackageNotices: renderRegistryNotices(thirdPartyMaterials),
		title: 'Third-Party Notices',
	});

	return {
		notices: await formatMarkdown(notices, root),
		packages: new Set(attributed.map((entry) => entry.name)).size,
		summary: await formatMarkdown(summary, root),
	};
}

export interface ThirdPartyLicenseOptions {
	/** True verifies the committed documents; false rewrites them. */
	check: boolean;
}

export function parseThirdPartyLicenseArgs(args: string[]): ThirdPartyLicenseOptions {
	const { values } = parseArgs({ args, options: { check: { type: 'boolean' } }, strict: true });
	return { check: values.check === true };
}

export async function runThirdPartyLicenses(options: ThirdPartyLicenseOptions): Promise<number> {
	const root = cwd();
	const generated = await generate(root);
	const documents = [
		{ content: generated.summary, name: OUTPUT },
		{ content: generated.notices, name: NOTICES_OUTPUT },
	];

	if (!options.check) {
		for (const document of documents) {
			await Bun.write(join(root, document.name), document.content);
			console.log(`[OK] Wrote ${document.name}`);
		}
		return 0;
	}

	for (const document of documents) {
		const committed = await Bun.file(join(root, document.name))
			.text()
			.catch(() => '');

		if (committed !== document.content) {
			console.error(
				`[FAIL] ${document.name} is out of date with the dependency graph or distributed-materials registry.`,
			);
			console.error('Run `bun run licenses:generate` and commit the result.');
			return 1;
		}
	}

	// Rule 5. See `GeneratedDocuments.packages`: parity between two documents generated from an
	// empty closure is parity between two documents that attribute nobody.
	if (generated.packages === 0) {
		console.error('[FAIL] The runtime closure held no distributed packages.');
		console.error('Attribution cannot be verified against a closure that resolved to nothing.');
		return 1;
	}

	console.log(
		`[OK] ${OUTPUT} and ${NOTICES_OUTPUT} match the dependency graph and ` +
			`distributed-materials registry (${generated.packages} package(s) attributed).`,
	);
	return 0;
}

if (import.meta.main) {
	// Without --check this rewrites two committed files, so a mistyped flag must not fall through
	// to a real write. Bad arguments exit 2; drift exits 1.
	let options: ThirdPartyLicenseOptions;
	try {
		options = parseThirdPartyLicenseArgs(Bun.argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] generate-third-party-licenses: ${message}`);
		console.error('Usage: bun scripts/generate-third-party-licenses.ts [--check]');
		exit(2);
	}
	exit(await runThirdPartyLicenses(options));
}
