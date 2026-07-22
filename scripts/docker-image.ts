#!/usr/bin/env bun
/**
 * Build / push the aidd container image with both the floating `:latest` tag
 * and the explicit `:{package.version}` tag (spernakit's docker-image.ts
 * methodology). docker-compose.production.yml requires APP_VERSION (no
 * :latest fallback), so both tags always exist for compose-up and rollback.
 *
 * The agent-backend CLI versions baked into the image are pinned here (single
 * source of truth) and passed to the Dockerfile as build args — bump a version
 * on this map and rebuild to ship newer CLIs.
 *
 * Usage:
 *   bun scripts/docker-image.ts build   # docker build with both tags
 *   bun scripts/docker-image.ts push    # docker push both tags
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const AGENT_CLI_VERSIONS = {
	CLAUDE_CODE_VERSION: '2.1.175',
	CODEX_VERSION: '0.139.0',
	KILOCODE_VERSION: '7.3.45',
	OPENCODE_VERSION: '1.17.4',
} as const;

const projectRoot = resolve(import.meta.dirname, '..');

interface PackageJson {
	name?: string;
	version?: string;
}

export function imageTags(pkg: PackageJson): { image: string; tags: string[] } {
	if (!pkg.name || !pkg.version) {
		throw new Error('package.json must have name and version');
	}
	return { image: `ghcr.io/nomadicdaddy/${pkg.name}`, tags: ['latest', pkg.version] };
}

export function buildArgs(image: string, tags: string[]): string[] {
	const args = ['build'];
	for (const tag of tags) {
		args.push('-t', `${image}:${tag}`);
	}
	for (const [key, value] of Object.entries(AGENT_CLI_VERSIONS)) {
		args.push('--build-arg', `${key}=${value}`);
	}
	args.push('.');
	return args;
}

function run(args: string[]): number {
	const result = spawnSync('docker', args, { cwd: projectRoot, stdio: 'inherit' });
	return result.status ?? 1;
}

/**
 * Runs the image license gate against a local, already-built image.
 *
 * Separate from `run` (which hardcodes `docker`): the gate is a bun script, so it
 * needs the `bun` binary. No `docker pull` — `check-image-licenses.ts` fails on a
 * missing image, and `docker push` requires the image to exist locally anyway.
 */
export function verifyImageLicenses(imageRef: string): number {
	const result = spawnSync('bun', ['scripts/check-image-licenses.ts', '--image', imageRef], {
		cwd: projectRoot,
		stdio: 'inherit',
	});
	return result.status ?? 1;
}

/**
 * The ordered publication sequence: license gate FIRST, then one push per tag.
 *
 * Pure so the ordering is testable without docker. The gate targets the
 * `{version}` tag (the one the built image actually carries), and a non-compliant
 * image cannot reach the first `docker push`.
 */
export function publishPlan(
	image: string,
	version: string,
	tags: string[]
): { args: string[]; cmd: string }[] {
	const steps: { args: string[]; cmd: string }[] = [
		{ args: ['scripts/check-image-licenses.ts', '--image', `${image}:${version}`], cmd: 'bun' },
	];
	for (const tag of tags) {
		steps.push({ args: ['push', `${image}:${tag}`], cmd: 'docker' });
	}
	return steps;
}

export function main(argv: string[] = process.argv.slice(2)): number {
	const subcommand = argv[0];
	if (subcommand !== 'build' && subcommand !== 'push') {
		console.error('Usage: bun scripts/docker-image.ts <build|push>');
		return 2;
	}

	const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as PackageJson;
	if (!pkg.version) throw new Error('package.json must have a version');
	const { image, tags } = imageTags(pkg);
	const version = pkg.version;

	if (subcommand === 'build') {
		const buildStatus = run(buildArgs(image, tags));
		if (buildStatus !== 0) return buildStatus;
		// Gate the built image: a Dockerfile regression (dropped COPY, re-baked CLI)
		// must fail the build before it can be pushed.
		return verifyImageLicenses(`${image}:${version}`);
	}

	// Push runs the full publishPlan so the license gate fires BEFORE the first push,
	// even though `build` already gated it: `docker:build` and `docker:push` are
	// separate invocations, and a push can be issued against an image left over from
	// an earlier, ungated build.
	for (const step of publishPlan(image, version, tags)) {
		const result = spawnSync(step.cmd, step.args, { cwd: projectRoot, stdio: 'inherit' });
		const status = result.status ?? 1;
		if (status !== 0) return status;
	}
	return 0;
}

if (import.meta.main) {
	process.exit(main());
}
