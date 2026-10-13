import { readLock } from '../shared-core/lock.ts';
import { normalizeProjectPath } from './contracts.ts';

/**
 * The files in this repository that are delivered to it, and so are not its own code to cover.
 *
 * A delivered file is written here by its owner and tested where it is owned. Counting it as this
 * repository's module made the coverage floors move with every delivery: ten new delivered files
 * dropped the scripts area under its floor with every test passing, and a test that loaded them to
 * restore the module count dragged the line count down instead. Neither figure said anything about
 * the code this repository writes. So delivered files are left out of the count on both sides, the
 * inventory and the measured records (Phillip, room #9942).
 *
 * The list is the repository's lock, read with the delivered reader. That is safe to key an
 * exclusion on because the lock cannot be padded: the shared-files check holds its entries to
 * exactly the files each group delivers, so a path added to it to hide an uncovered file fails
 * that check. A lock that cannot be read throws here, as it does there; no lock means nothing is
 * delivered and nothing is left out.
 */
export function deliveredPaths(projectRoot: string): Set<string> {
	const lock = readLock(projectRoot);
	const delivered = new Set<string>();
	for (const files of Object.values(lock?.groups ?? {})) {
		for (const path of Object.keys(files ?? {})) delivered.add(normalizeProjectPath(path));
	}
	return delivered;
}
