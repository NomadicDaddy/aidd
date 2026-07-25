/**
 * Resolves the runtime closure: every third-party package reachable from the direct production
 * dependencies, transitively, together with the real license text each package ships.
 *
 * The direct-dependency tables answer "what did we choose"; this answers "what do we actually
 * distribute". A compiled binary bundles transitive runtime code, and a container image copies
 * the installed tree, so attribution obligations reach the whole closure, not just the packages
 * named in package.json.
 *
 * License text is read from each package's own LICENSE/NOTICE file rather than synthesized from
 * its SPDX id, because attribution requires the package's own copyright line, which an SPDX id
 * does not carry.
 *
 * Resolution lives in resolve.ts.
 */

import { join } from 'node:path';

import { collectLockfileClosure } from '../license-core/lockfile.ts';
import { licenseOf } from './collect.ts';
import { byCodepoint } from './order.ts';
import { readJson, readLicenseText, readNoticeText, resolveInstalledVersion } from './resolve.ts';

export interface ClosurePackage {
	license: string;
	/** Verbatim contents of the package's LICENSE file, when it ships one. */
	licenseText: null | string;
	name: string;
	/** Verbatim NOTICE file (Apache-2.0 requires these attributions to be passed on). */
	noticeText: null | string;
	version: string;
}

/**
 * The distributed set, taken from the lockfile, with each package's own license text read from
 * disk.
 *
 * WHICH packages ship comes from bun.lock, because that is identical on every platform. WHAT each
 * one says about its license has to come from the installed copy, because a lockfile records no
 * license and attribution needs the package's own copyright line. Walking the installed tree for
 * both made the output depend on the install layout — isolated on Windows, hoisted on Linux — and
 * the drift gate could not be satisfied on both at once.
 */
export async function collectLicensedClosure(
	root: string,
	workspaces: string[],
	internal: Set<string>,
): Promise<{ closure: ClosurePackage[]; unresolved: string[] }> {
	const locked = await collectLockfileClosure(root, {
		includePeerDependencies: true,
		internal,
		rootFields: ['dependencies'],
		workspaces: ['', ...workspaces],
	});
	const closure: ClosurePackage[] = [];
	const unresolved = [...locked.unresolved];

	for (const pkg of locked.packages) {
		const dir = await resolveInstalledVersion(root, workspaces, pkg.name, pkg.version);
		if (dir === null) {
			unresolved.push(`${pkg.name}@${pkg.version}`);
			continue;
		}
		const manifest = await readJson(join(dir, 'package.json'));
		closure.push({
			license: licenseOf(manifest),
			licenseText: await readLicenseText(dir),
			name: pkg.name,
			noticeText: await readNoticeText(dir),
			version: pkg.version,
		});
	}

	return { closure, unresolved };
}

/**
 * License distribution over the closure - i.e. over what actually ships.
 *
 * Deterministic: it depends on the manifests and the lockfile, not on whatever else happens to
 * be installed in node_modules at the time. Summarizing the whole install tree instead made the
 * generated file drift whenever a dev tool pulled in another version of something, so the drift
 * gate failed on a clean checkout.
 */
export function summarizeClosure(closure: ClosurePackage[]): {
	distribution: { count: number; license: string }[];
	flagged: { license: string; name: string }[];
	uniqueNames: number;
	uniqueVersions: number;
} {
	const counts = new Map<string, number>();
	for (const pkg of closure) counts.set(pkg.license, (counts.get(pkg.license) ?? 0) + 1);

	return {
		distribution: [...counts.entries()]
			.map(([license, count]) => ({ count, license }))
			.sort((a, b) => b.count - a.count || byCodepoint(a.license, b.license)),
		flagged: closure
			.filter((pkg) => /GPL|SSPL|EUPL|CDDL|OSL|MPL/i.test(pkg.license))
			.map((pkg) => ({ license: pkg.license, name: `${pkg.name}@${pkg.version}` }))
			.sort((a, b) => byCodepoint(a.name, b.name)),
		uniqueNames: new Set(closure.map((pkg) => pkg.name)).size,
		uniqueVersions: closure.length,
	};
}

/** Packages that ship no license file: attribution has to be sourced by hand. */
export function packagesWithoutLicenseText(closure: ClosurePackage[]): ClosurePackage[] {
	return closure.filter((pkg) => pkg.licenseText === null);
}
