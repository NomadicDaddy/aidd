/**
 * Asserts the license materials a distributed artifact must carry.
 *
 * aidd actually distributes: standalone executables through GitHub releases, and a container
 * image when one is published. Both redistribute Bun, which STATICALLY LINKS JavaScriptCore
 * (LGPL-2) and TinyCC (LGPL-2.1). Static linking is the case the LGPL is most specific about —
 * a recipient must be able to modify the library and relink the program — so an upstream link is
 * not enough on its own, and the offer in licenses/SOURCE-OFFER.md is what fills that gap.
 *
 * This runs inside check:licenses (so: smoke:qc and CI). Deleting a license text or gutting the
 * offer fails the build rather than quietly shipping an artifact that cannot satisfy the terms it
 * travels under.
 */

import { join } from 'node:path';
import { exit } from 'node:process';

const REQUIRED_LICENSE_FILES = [
	'licenses/BUN-LICENSE.md',
	'licenses/LGPL-2.0.txt',
	'licenses/LGPL-2.1.txt',
	'licenses/SOURCE-OFFER.md',
];

/**
 * The commitments that make the offer an offer. An offer that omits the duration, or the relink
 * materials, or a way to identify the exact binary a recipient holds, is not one a recipient can
 * act on — and LGPL relink rights are the entire point of it existing here.
 */
const REQUIRED_OFFER_TERMS = [
	'at least three years',
	'relink',
	'complete source tree',
	'SHA-256',
	// GPLv2 §3(b) requires the offer to run to "any third party", not only to people who received
	// the artifact from us. The first draft was narrower than the licence.
	'any third\nparty',
	// GPLv3 conveyance over a network wants equivalent ACCESS to the source, not merely an offer
	// to post it on request, so the directions have to be in here too.
	'sources.debian.org',
];

export async function assertRuntimeLicenseFiles(root: string): Promise<void> {
	const missing: string[] = [];
	for (const path of REQUIRED_LICENSE_FILES) {
		if (!(await Bun.file(join(root, path)).exists())) missing.push(path);
	}

	if (missing.length > 0) {
		console.error('Required license material is missing:');
		for (const path of missing) console.error(`  - ${path}`);
		console.error('');
		console.error('The standalone binaries embed Bun, which statically links LGPL libraries.');
		console.error('These files travel with every release; they are not optional.');
		exit(1);
	}

	const offer = await Bun.file(join(root, 'licenses/SOURCE-OFFER.md')).text();
	const missingTerms = REQUIRED_OFFER_TERMS.filter((term) => !offer.includes(term));
	if (missingTerms.length > 0) {
		console.error('licenses/SOURCE-OFFER.md is missing required commitments:');
		for (const term of missingTerms) console.error(`  - ${term}`);
		exit(1);
	}

	// An offer nobody can act on is not an offer.
	const placeholders = [...new Set(offer.match(/<[A-Z][A-Z _-]+>/g) ?? [])];
	if (placeholders.length > 0) {
		console.error('licenses/SOURCE-OFFER.md still contains placeholders:');
		for (const placeholder of placeholders) console.error(`  - ${placeholder}`);
		exit(1);
	}
}
