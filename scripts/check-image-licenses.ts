#!/usr/bin/env bun
/**
 * Verifies license compliance against the BUILT container image, not the source tree.
 *
 * Enforces: the notices and source offer the shipped image's contents require are present in that
 * image. No assertion ID: the catalog states no invariant over distribution obligations.
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
import { parseArgs } from 'node:util';

import { collectBasePackages, renderInventory } from './lib/image-licenses/image-inventory.ts';
import { verifyAgentClisAbsent, verifyNoticesPresent } from './lib/image-licenses/image-notices.ts';

const INVENTORY = join('licenses', 'base-image-packages.md');

export interface ImageLicenseOptions {
	image: string;
	update: boolean;
}

export function parseImageLicenseArgs(args: string[]): ImageLicenseOptions {
	const { values } = parseArgs({
		args,
		options: { image: { type: 'string' }, update: { type: 'boolean' } },
		strict: true,
	});
	// parseArgs keeps the LAST `--image`, which is what the package script needs: it supplies a
	// default tag, and a caller appending their own must win rather than be silently ignored.
	//
	// It also takes the token after `--image` as its value even when that token is itself a flag,
	// so `--image --update` would inspect a tag no daemon has and report a missing image instead of
	// the bad argument that caused it.
	if (
		values.image !== undefined &&
		(values.image.trim() === '' || values.image.startsWith('-'))
	) {
		throw new Error('--image requires a tag (e.g. --image aidd:latest).');
	}
	return { image: values.image ?? 'aidd:latest', update: values.update === true };
}

/** Renders the inventory the way format:check expects to find it on disk. */
async function renderCommittedInventory(root: string, packages: string[]): Promise<string> {
	// Formatted with the repo's prettier config for the same reason the other generated documents
	// are: format:check reflows markdown tables, and an unformatted generator would report drift
	// against its own output forever.
	const prettier = await import('prettier');
	const config = (await prettier.resolveConfig(join(root, INVENTORY))) ?? {};
	return prettier.format(renderInventory(packages), { ...config, parser: 'markdown' });
}

export async function runImageLicenses(options: ImageLicenseOptions): Promise<number> {
	const root = cwd();

	const noticesOk = await verifyNoticesPresent(options.image, options.update);
	const clisOk = await verifyAgentClisAbsent(options.image);
	if (!noticesOk || !clisOk) return 1;

	const packages = await collectBasePackages(options.image);
	if (packages.length === 0) {
		console.error(`[FAIL] Read no packages from ${options.image}; is it the aidd image?`);
		return 1;
	}

	const generated = await renderCommittedInventory(root, packages);
	const target = join(root, INVENTORY);

	if (options.update) {
		await Bun.write(target, generated);
		console.log(`[OK] Wrote ${INVENTORY} (${packages.length} packages).`);
		return 0;
	}

	const committed = await Bun.file(target)
		.text()
		.catch(() => '');
	if (committed !== generated) {
		console.error(`[FAIL] ${INVENTORY} is out of date with the built image.`);
		console.error('Run `bun run licenses:image` and commit the result.');
		return 1;
	}

	console.log(`[OK] ${INVENTORY} matches the built image (${packages.length} packages).`);
	return 0;
}

if (import.meta.main) {
	// `--update` rewrites a committed file, so a mistyped flag must not fall through to a run that
	// silently verifies the default tag instead. Bad arguments exit 2; findings exit 1.
	let options: ImageLicenseOptions;
	try {
		options = parseImageLicenseArgs(Bun.argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] check-image-licenses: ${message}`);
		console.error('Usage: bun scripts/check-image-licenses.ts [--image <tag>] [--update]');
		exit(2);
	}
	exit(await runImageLicenses(options));
}
