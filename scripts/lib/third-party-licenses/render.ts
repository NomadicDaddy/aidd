/**
 * Renders the third-party license document from resolved dependency data.
 *
 * The document is generated, never hand-edited. `check:licenses` regenerates it and diffs against
 * the committed copy so it stays aligned with the installed graph.
 */

import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';

import { licenseIdentifiers, reviewLicenseExpression } from '../license-core/expression.ts';
import { type DirectDependency, type GraphSummary } from './collect.ts';
import { NOTICES } from './notices.ts';
import { byCodepoint } from './order.ts';

/**
 * Formats generated markdown with the repo's own prettier config.
 *
 * Without this, `format:check` reflows the file (prettier pads markdown table
 * cells) and `check:licenses` then reports drift against its own output. The
 * two gates have to agree on one canonical form.
 */
export async function formatMarkdown(content: string, root: string): Promise<string> {
	const config = (await resolveConfig(join(root, 'THIRD-PARTY-LICENSES.md'))) ?? {};
	return await format(content, { ...config, parser: 'markdown' });
}

export interface RenderOptions {
	dependencies: DirectDependency[];
	/** Analysis of what the copyleft/weak-copyleft packages mean for this project. */
	flaggedNote: string;
	graph: GraphSummary;
	/** Heading for each workspace group, keyed by workspace directory. */
	groups: { title: string; workspaces: string[] }[];
	intro: string;
	nonPackageSummary: string;
	/** Sections that state the inventory's scope and known gaps. */
	scopeSections: { body: string; heading: string }[];
	title: string;
}

function table(dependencies: DirectDependency[]): string {
	const lines = [
		'| Package | Version | License |',
		'| ------- | ------- | ------- |',
		...dependencies.map((dep) => {
			const link = `[${dep.name}](https://www.npmjs.com/package/${dep.name})`;
			return `| ${link} | ${dep.version} | ${dep.license} |`;
		}),
	];
	return lines.join('\n');
}

/**
 * Licenses appearing in `packages` that we have no reviewed notice for.
 *
 * Takes anything carrying a license — a direct dependency or a package from the runtime closure.
 * Gating only the direct dependencies lets a transitive package arrive under an unreviewed (or
 * UNKNOWN) license and become a silent row in the inventory.
 */
export function unreviewedLicenses(packages: { license: string }[]): string[] {
	const reviewed = new Set(Object.keys(NOTICES));
	const unreviewed = new Set<string>();
	for (const { license } of packages) {
		if (!reviewLicenseExpression(license, { reviewed }).ok) unreviewed.add(license);
	}
	return [...unreviewed].sort(byCodepoint);
}

export function render(options: RenderOptions): string {
	const {
		dependencies,
		flaggedNote,
		graph,
		groups,
		intro,
		nonPackageSummary,
		scopeSections,
		title,
	} = options;
	const sections: string[] = [`# ${title}`, '', intro.trim(), ''];

	for (const group of groups) {
		const inGroup = dependencies
			.filter((dep) => group.workspaces.includes(dep.workspace))
			.filter(
				(dep, index, all) => all.findIndex((other) => other.name === dep.name) === index,
			)
			.sort((a, b) => byCodepoint(a.name, b.name));
		if (inGroup.length === 0) continue;
		sections.push(`## ${group.title}`, '', table(inGroup), '');
	}

	sections.push(nonPackageSummary.trim(), '');

	// Notices: one section per reviewed license family present in a direct dependency. A dependency's
	// license may be a compound SPDX expression (e.g. "MIT OR Apache-2.0");
	// each reviewed identifier inside it still carries its own notice, so decompose to identifiers
	// rather than keying NOTICES on the raw expression string.
	const usersByFamily = new Map<string, string[]>();
	for (const dep of dependencies) {
		for (const family of licenseIdentifiers(dep.license)) {
			if (!NOTICES[family]) continue;
			const users = usersByFamily.get(family) ?? [];
			if (!users.includes(dep.name)) users.push(dep.name);
			usersByFamily.set(family, users);
		}
	}
	sections.push('## Required notices by license family', '');

	for (const family of [...usersByFamily.keys()].sort()) {
		const notice = NOTICES[family];
		if (!notice) continue;
		const users = [...usersByFamily.get(family)!].sort();
		sections.push(
			`### ${notice.heading}`,
			'',
			`Applies to: ${users.join(', ')}.`,
			'',
			notice.body,
			'',
		);
	}

	// The runtime closure is a deterministic function of the manifests and lockfile and excludes
	// development tooling.
	sections.push(
		'## Runtime dependency closure',
		'',
		`The tables above enumerate the direct production dependencies. Counting everything they`,
		`pull in transitively, the runtime closure is **${graph.uniqueVersions}** third-party`,
		`packages (${graph.uniqueNames} unique names). Development and build tooling is not part`,
		`of it and is not counted here. Its license distribution is:`,
		'',
		'| License | Packages |',
		'| ------- | -------- |',
		...graph.distribution.map((entry) => `| ${entry.license} | ${entry.count} |`),
		'',
	);

	if (graph.flagged.length > 0) {
		sections.push(
			'### Copyleft and weak-copyleft packages',
			'',
			'These packages carry a copyleft or weak-copyleft license and are listed',
			'individually so their obligations can be checked against how they are used:',
			'',
			...graph.flagged.map((entry) => `- \`${entry.name}\` (${entry.license})`),
			'',
			flaggedNote.trim(),
			'',
		);
	} else {
		sections.push(
			'No copyleft or weak-copyleft licensed package (GPL, AGPL, SSPL, EUPL, CDDL,',
			'OSL, MPL) appears in the runtime closure. Build tooling is a separate question and',
			'is not inventoried here.',
			'',
		);
	}

	for (const section of scopeSections) {
		sections.push(`## ${section.heading}`, '', section.body.trim(), '');
	}

	sections.push(
		'## Regenerating this file',
		'',
		'This document is generated from the installed dependency graph and',
		'`licenses/distributed-materials.json`. Run `bun run licenses:generate` after changing',
		'dependencies or distributed-material provenance, and commit the result.',
		'`bun run check:licenses` (part of `smoke:qc` and CI) regenerates it in memory and',
		'fails when the committed copy no longer matches what is installed.',
		'',
	);

	return `${sections
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()}\n`;
}
