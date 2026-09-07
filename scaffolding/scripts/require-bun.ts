// Preinstall guard: fail any install not driven by bun, or driven by a bun older than the one
// this repository pins. Replaces only-allow — a guard that has to bunx-download itself inside
// preinstall is a network/cache race (three workspace preinstalls racing one bunx cache flaked in
// CI), and a bare `only-allow` binary only exists in a node_modules the preinstall runs too early
// to see. Package managers all advertise themselves in npm_config_user_agent; bun's starts with
// "bun/".
//
// The version floor exists because aidd ships as source: there is no bundled runtime, so the Bun
// the person installing happens to have IS the runtime aidd runs on. `packageManager` is the
// single pin — check-deps holds the CI workflows to it, and this holds the install to it — so a
// downloader whose Bun predates a syntax or API the code uses fails here with the version to
// install, rather than several commands later inside an unrelated stack trace.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const userAgent = process.env['npm_config_user_agent'] ?? '';
if (!userAgent.startsWith('bun/')) {
	console.error('Use "bun install" for installation in this project.');
	console.error("If you don't have Bun, see https://bun.sh/docs/installation");
	process.exit(1);
}

/** Compares dotted numeric versions, ignoring any prerelease/build suffix. -1 | 0 | 1. */
function compareVersions(a: string, b: string): number {
	const parts = (v: string) =>
		(v.split(/[-+]/)[0] ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
	const [left, right] = [parts(a), parts(b)];
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff !== 0) return diff > 0 ? 1 : -1;
	}
	return 0;
}

// Resolved from this file's own location, not the cwd: each workspace runs its own preinstall,
// and only the repository root declares the pin that matters.
function pinnedBunVersion(): null | string {
	try {
		const raw = readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8');
		const pkg = JSON.parse(raw) as { packageManager?: string };
		return pkg.packageManager?.match(/^bun@(.+)$/)?.[1] ?? null;
	} catch {
		// An unreadable manifest is not this guard's failure to report; bun install will say so.
		return null;
	}
}

const required = pinnedBunVersion();
if (required !== null && compareVersions(Bun.version, required) < 0) {
	console.error(
		`Bun ${Bun.version} is too old for this project, which pins bun@${required} in package.json.`,
	);
	console.error('Upgrade with "bun upgrade", or see https://bun.sh/docs/installation');
	process.exit(1);
}
