#!/usr/bin/env bun
/**
 * Verifies license compliance against the BUILT container image, not the source tree.
 *
 *   bun scripts/check-image-licenses.ts [--image <tag>]            # verify
 *   bun scripts/check-image-licenses.ts [--image <tag>] --update   # refresh the base inventory
 *
 * Three things no source-tree check can know:
 *
 * 1. Whether the required notices actually reached the image.
 * 2. What the base system contributes. `licenses/SOURCE-OFFER.md` promises corresponding source
 *    for every GPL/LGPL base package "identified in the accompanying base-image-packages.md" —
 *    so that file has to exist, and has to match the image it describes, or the offer names
 *    nothing.
 * 3. Whether agent CLIs remain excluded. Baking them into the image would redistribute packages
 *    whose vendor terms do not grant aidd that right, so this check fails the build if they appear.
 *
 * Needs docker and a built image, so it runs in the docker smoke path rather than in smoke:qc,
 * which stays static.
 */

import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const INVENTORY = join('licenses', 'base-image-packages.md');

const REQUIRED_IN_IMAGE = [
	'/app/LICENSE',
	'/app/THIRD-PARTY-LICENSES.md',
	'/app/THIRD-PARTY-NOTICES.md',
	'/app/licenses/BUN-LICENSE.md',
	'/app/licenses/LGPL-2.0.txt',
	'/app/licenses/LGPL-2.1.txt',
	'/app/licenses/SOURCE-OFFER.md',
	'/app/licenses/base-image-packages.md',
	'/app/licenses/distributed-materials.json',
	// Debian ships the GPL/LGPL texts its own packages reference; they must survive a slimming pass.
	'/usr/share/common-licenses/GPL-2',
	'/usr/share/common-licenses/GPL-3',
	'/usr/share/common-licenses/LGPL-2.1',
];

/**
 * Baking any of these back into the image would redistribute them. See 2.116.0.
 *
 * These are BINARY names, not package names — the guard runs `command -v`. @kilocode/cli installs
 * `kilo`, so listing it as `kilocode` looked for something that never exists and would have waved
 * a re-baked Kilo Code CLI straight through the one check meant to catch it.
 */
const FORBIDDEN_IN_IMAGE = ['claude', 'codex', 'opencode', 'kilo'];

interface Args {
	image: string;
	update: boolean;
}

function parseArgs(argv: string[]): Args {
	// lastIndexOf: the package script supplies a default --image, and a caller appending their own
	// must win rather than be silently ignored.
	const index = argv.lastIndexOf('--image');
	const image = index >= 0 ? argv[index + 1] : undefined;
	return { image: image ?? 'aidd:latest', update: argv.includes('--update') };
}

async function runInImage(image: string, script: string): Promise<string> {
	// No env spread: Bun.spawn inherits the environment, and check:env-spread forbids handing a
	// child the whole of process.env.
	let proc;
	try {
		proc = Bun.spawn(['docker', 'run', '--rm', '--entrypoint', 'sh', image, '-c', script], {
			stderr: 'pipe',
			stdout: 'pipe',
		});
	} catch {
		// Bun.spawn throws ENOENT for a missing binary rather than returning a non-zero exit, so a
		// machine without docker would otherwise die on an unhandled rejection and a stack trace.
		console.error('docker is not on PATH; cannot inspect the image.');
		console.error('Install Docker, or run this on a machine that has it.');
		exit(1);
	}
	const stdout = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) {
		const stderr = await new Response(proc.stderr).text();
		console.error(`docker run failed against ${image}:`);
		console.error(stderr.trim() || stdout.trim());
		exit(1);
	}
	return stdout;
}

async function assertNoticesPresent(image: string, updating: boolean): Promise<void> {
	// The inventory is the file --update is about to generate, so it cannot be inside the image on
	// the run that creates it. Generate, rebuild, then check.
	const required = updating
		? REQUIRED_IN_IMAGE.filter((path) => !path.endsWith('base-image-packages.md'))
		: REQUIRED_IN_IMAGE;
	const output = await runInImage(
		image,
		required.map((path) => `[ -e ${path} ] || echo MISSING ${path}`).join('; '),
	);
	const missing = output
		.split('\n')
		.filter((line) => line.startsWith('MISSING'))
		.map((line) => line.replace('MISSING ', '').trim());

	if (missing.length > 0) {
		console.error(`${image} is missing license material:`);
		for (const path of missing) console.error(`  - ${path}`);
		console.error('');
		console.error('The image ships an LGPL-linked binary on a GPL/LGPL Debian base. Check the');
		console.error('Dockerfile COPY lines and that .dockerignore keeps the notices in context.');
		exit(1);
	}
	console.log(`${image}: license material present (${required.length} paths).`);
}

async function assertAgentClisAbsent(image: string): Promise<void> {
	const output = await runInImage(
		image,
		FORBIDDEN_IN_IMAGE.map(
			(binary) => `command -v ${binary} >/dev/null 2>&1 && echo FOUND ${binary}`,
		)
			.join('; ')
			.concat('; true'),
	);
	const found = output
		.split('\n')
		.filter((line) => line.startsWith('FOUND'))
		.map((line) => line.replace('FOUND ', '').trim());

	if (found.length > 0) {
		console.error(`${image} contains agent CLIs that must not be redistributed:`);
		for (const binary of found) console.error(`  - ${binary}`);
		console.error('');
		console.error('Baking these in makes every published image a redistribution of them, and');
		console.error('@anthropic-ai/claude-code carries no redistribution grant (SEE LICENSE IN');
		console.error(
			'README.md -> Anthropic commercial terms). The entrypoint installs them into',
		);
		console.error('the home volume at run time instead; keep them out of the image.');
		exit(1);
	}
	console.log(`${image}: no agent CLIs baked in (${FORBIDDEN_IN_IMAGE.length} checked).`);
}

/**
 * Base-system packages and the licenses their copyright files declare.
 *
 * Debian has no license field in the package database (unlike apk), so the licenses come from
 * the DEP-5 `License:` lines in /usr/share/doc/<pkg>/copyright — which is also where each
 * package's own copyright notices live, and those ship in the image already.
 */
async function collectBasePackages(image: string): Promise<string[]> {
	// Single quotes around the dpkg format string: sh would otherwise expand ${Package} itself
	// (to nothing) before dpkg-query ever saw it, and the inventory would come back empty.
	//
	// Licenses come from two places, because only some Debian copyright files are DEP-5:
	//   1. `License:` lines (machine-readable ones);
	//   2. references to /usr/share/common-licenses/<NAME> in the free-form ones.
	// Reading only (1) marked 18 packages UNKNOWN — including libc6 (LGPL-2.1) and the GCC runtime
	// (GPL-3 with the runtime exception), which are exactly the copyleft ones that matter.
	//
	// The SOURCE package name and version are what a corresponding-source request is actually
	// fulfilled from: a recipient needs `glibc`, not `libc6`.
	const script = [
		"for pkg in $(dpkg-query -W -f='${Package}\\n' 2>/dev/null); do",
		'  ver=$(dpkg-query -W -f=\'${Version}\' "$pkg" 2>/dev/null)',
		'  src=$(dpkg-query -W -f=\'${source:Package}\' "$pkg" 2>/dev/null)',
		'  srcver=$(dpkg-query -W -f=\'${source:Version}\' "$pkg" 2>/dev/null)',
		'  copyright="/usr/share/doc/$pkg/copyright"',
		'  declared=$(grep -hoiE "^License: [A-Za-z0-9.+-]+" "$copyright" 2>/dev/null | sed "s/^[Ll]icense: //")',
		'  referenced=$(grep -hoE "common-licenses/[A-Za-z0-9.+-]+" "$copyright" 2>/dev/null | sed "s|common-licenses/||")',
		'  lic=$(printf "%s\\n%s\\n" "$declared" "$referenced" | grep -v "^$" | sort -u | paste -sd "," -)',
		'  echo "$pkg|$ver|${src:-$pkg}|${srcver:-$ver}|${lic:-UNKNOWN}"',
		'done',
	].join('\n');

	const output = await runInImage(image, script);
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.includes('|'))
		.sort();
}

function renderInventory(packages: string[]): string {
	const copyleft = packages.filter((entry) => /GPL/i.test(entry.split('|')[4] ?? ''));
	const unknown = packages.filter((entry) => (entry.split('|')[4] ?? '') === 'UNKNOWN');

	return [
		'# Base image packages',
		'',
		"Operating-system packages in the aidd container image, read from the image's own dpkg",
		"database and the `License:` lines of each package's copyright file. Generated by",
		'`bun run licenses:image`; do not edit by hand.',
		'',
		`The image is built on a Debian (bookworm-slim) base and carries **${packages.length}** packages.`,
		'They are unmodified components of the base operating system, distributed alongside the',
		"application rather than linked into it. Each package's copyright file ships in the image at",
		'`/usr/share/doc/<package>/copyright`, and the license texts they reference ship at',
		'`/usr/share/common-licenses/`.',
		'',
		'## Copyleft packages',
		'',
		`**${copyleft.length}** of the ${packages.length} packages carry a GPL-family license. The`,
		'corresponding-source offer in [`SOURCE-OFFER.md`](./SOURCE-OFFER.md) covers them, and this is',
		'the list it points at. Fulfilment is answered from the SOURCE package, not the binary one (a',
		'request about `libc6` is served from `glibc`), so both are recorded. Debian publishes the',
		'sources at <https://sources.debian.org>.',
		'',
		...copyleft.map((entry) => {
			const [name, version, source, sourceVersion, license] = entry.split('|');
			return `- \`${name}@${version}\` (${license}) — source \`${source}@${sourceVersion}\``;
		}),
		'',
		...(unknown.length > 0
			? [
					'## Packages with no machine-readable license',
					'',
					`${unknown.length} package(s) declare no license this tool can read — neither a \`License:\``,
					'line nor a reference to `/usr/share/common-licenses/`. Their copyright files ship in the',
					'image at `/usr/share/doc/<package>/copyright` and must be read by hand rather than',
					'assumed permissive.',
					'',
					...unknown.map((entry) => {
						const [name, version] = entry.split('|');
						return `- \`${name}@${version}\``;
					}),
					'',
				]
			: []),
		'## All base image packages',
		'',
		'| Package | Version | Source package | Source version | Licenses |',
		'| ------- | ------- | -------------- | -------------- | -------- |',
		...packages.map((entry) => {
			const [name, version, source, sourceVersion, license] = entry.split('|');
			return `| ${name} | ${version} | ${source} | ${sourceVersion} | ${license || 'UNKNOWN'} |`;
		}),
		'',
	].join('\n');
}

async function main(): Promise<void> {
	const root = cwd();
	const args = parseArgs(Bun.argv.slice(2));

	await assertNoticesPresent(args.image, args.update);
	await assertAgentClisAbsent(args.image);

	const packages = await collectBasePackages(args.image);
	if (packages.length === 0) {
		console.error(`Read no packages from ${args.image}; is it the aidd image?`);
		exit(1);
	}

	// Formatted with the repo's prettier config for the same reason the other generated documents
	// are: format:check reflows markdown tables, and an unformatted generator would report drift
	// against its own output forever.
	const prettier = await import('prettier');
	const config = (await prettier.resolveConfig(join(root, INVENTORY))) ?? {};
	const generated = await prettier.format(renderInventory(packages), {
		...config,
		parser: 'markdown',
	});
	const target = join(root, INVENTORY);

	if (args.update) {
		await Bun.write(target, generated);
		console.log(`Wrote ${INVENTORY} (${packages.length} packages).`);
		return;
	}

	const committed = await Bun.file(target)
		.text()
		.catch(() => '');
	if (committed !== generated) {
		console.error(`${INVENTORY} is out of date with the built image.`);
		console.error('Run `bun run licenses:image` and commit the result.');
		exit(1);
	}

	console.log(`${INVENTORY} matches the built image (${packages.length} packages).`);
}

if (import.meta.main) {
	await main();
}
