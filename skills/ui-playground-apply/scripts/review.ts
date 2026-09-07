#!/usr/bin/env bun

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

interface Provenance {
	copiedPaths: string[];
	repository: string;
	sourceCommit: string;
}

interface Change {
	path: string;
	status: 'A' | 'D' | 'M';
}

type Hashes = Map<string, string>;

function fail(message: string): never {
	console.error(`Playground review failed: ${message}`);
	process.exit(1);
}

function git(cwd: string, args: string[]): string {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		const detail = result.stderr.toString().trim();
		fail(`${args.join(' ')} in ${cwd}${detail ? `: ${detail}` : ''}`);
	}
	return result.stdout.toString().trim();
}

function stringArray(value: unknown, field: string): string[] {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some((entry) => typeof entry !== 'string' || entry.length === 0)
	) {
		fail(`playground/source.json ${field} must be a non-empty string array`);
	}
	return value as string[];
}

function provenanceFrom(playground: string): Provenance {
	const provenancePath = resolve(playground, 'playground', 'source.json');
	if (!existsSync(provenancePath)) fail(`missing ${provenancePath}`);

	let value: unknown;
	try {
		value = JSON.parse(readFileSync(provenancePath, 'utf8'));
	} catch {
		fail(`could not parse ${provenancePath}`);
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fail('playground/source.json must contain an object');
	}

	const record = value as Record<string, unknown>;
	if (typeof record.repository !== 'string' || record.repository.length === 0) {
		fail('playground/source.json must contain repository');
	}
	if (typeof record.sourceCommit !== 'string' || record.sourceCommit.length === 0) {
		fail('playground/source.json must contain sourceCommit');
	}

	return {
		copiedPaths: stringArray(record.copiedPaths, 'copiedPaths'),
		repository: record.repository,
		sourceCommit: record.sourceCommit,
	};
}

function treeHashes(repository: string, ref: string, copiedPaths: string[]): Hashes {
	const output = git(repository, [
		'ls-tree',
		'-r',
		'--format=%(objectname)%x09%(path)',
		ref,
		'--',
		...copiedPaths,
	]);
	const hashes: Hashes = new Map();
	for (const line of output.split(/\r?\n/)) {
		if (!line) continue;
		const separator = line.indexOf('\t');
		if (separator < 1) fail(`unexpected git ls-tree output: ${line}`);
		hashes.set(line.slice(separator + 1), line.slice(0, separator));
	}
	return hashes;
}

function playgroundHashes(playground: string, copiedPaths: string[]): Hashes {
	const output = git(playground, [
		'ls-files',
		'--cached',
		'--others',
		'--exclude-standard',
		'--',
		...copiedPaths,
	]);
	const hashes: Hashes = new Map();
	for (const path of output.split(/\r?\n/)) {
		if (!path) continue;
		const absolutePath = resolve(playground, path);
		if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
		hashes.set(path.replaceAll('\\', '/'), git(playground, ['hash-object', '--', path]));
	}
	return hashes;
}

function changesFrom(before: Hashes, after: Hashes): Change[] {
	const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
	const changes: Change[] = [];
	for (const path of paths) {
		const oldHash = before.get(path);
		const newHash = after.get(path);
		if (oldHash === newHash) continue;
		changes.push({
			path,
			status: oldHash === undefined ? 'A' : newHash === undefined ? 'D' : 'M',
		});
	}
	return changes;
}

const playgroundArgument = Bun.argv[2];
if (!playgroundArgument) fail('usage: review.ts <playground-path> [site-path]');

const playground = resolve(playgroundArgument);
const provenance = provenanceFrom(playground);
const source = resolve(Bun.argv[3] ?? provenance.repository);
git(playground, ['rev-parse', '--show-toplevel']);
git(source, ['rev-parse', '--show-toplevel']);
git(source, ['cat-file', '-e', `${provenance.sourceCommit}^{commit}`]);

const sourceHead = git(source, ['rev-parse', 'HEAD']);
const baseline = treeHashes(source, provenance.sourceCommit, provenance.copiedPaths);
const currentSite = treeHashes(source, sourceHead, provenance.copiedPaths);
const currentPlayground = playgroundHashes(playground, provenance.copiedPaths);
const sourceStatus = git(source, ['status', '--porcelain']);
const playgroundStatus = git(playground, ['status', '--porcelain']);

console.log(
	JSON.stringify(
		{
			copiedPaths: provenance.copiedPaths,
			playground,
			playgroundChanges: changesFrom(baseline, currentPlayground),
			playgroundDirty: playgroundStatus.length > 0,
			playgroundStatus: playgroundStatus ? playgroundStatus.split(/\r?\n/) : [],
			playgroundVsSite: changesFrom(currentSite, currentPlayground),
			source,
			sourceChanges: changesFrom(baseline, currentSite),
			sourceCommit: provenance.sourceCommit,
			sourceDirty: sourceStatus.length > 0,
			sourceHead,
			sourceStatus: sourceStatus ? sourceStatus.split(/\r?\n/) : [],
		},
		null,
		'\t',
	),
);
