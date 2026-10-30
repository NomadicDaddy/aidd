#!/usr/bin/env bun
/**
 * news-digest.ts
 *
 * The fixed tools the "Daily News Digest" scheduled directive calls, so its agent stops writing a
 * fresh helper into D:\applications\.news-digest each run (#17709). Network reads, the state file
 * and the final check live here; choosing and writing up the news stays the agent's job.
 *
 * Run: bun run news:digest -- <command> [options]
 *   advisories --start <ISO|previous> --end <ISO>
 *                                               reviewed npm advisories in the window, every page;
 *                                               `previous` starts where the last complete run ended
 *   releases --start <ISO> --end <ISO>         stack-repo GitHub releases in the window
 *   feed <url> [--count N]                      title | link | date per RSS or Atom entry
 *   article <url> [--chars N]                   readable text of one page
 *   state known --date <YYYY-MM-DD>             URLs first reported before that day
 *   state add --date <YYYY-MM-DD> --file <json> record that day's items once, prune > 7 days
 *   validate --date <YYYY-MM-DD>                check that day's digest file in news\
 *   archive --date <YYYY-MM-DD>                 move news\ daily files > 7 days old to news\archive\
 *
 * The daily digests live in news\ under the digest folder, and the state file stays at its root
 * (Phillip #20641).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { fetchAdvisories, formatAdvisoryLine } from './lib/news-digest/advisories.ts';
import { archiveOldDigests } from './lib/news-digest/archive.ts';
import {
	boundedFetch,
	type FetchFn,
	fetchText,
	htmlToText,
	parseFeed,
} from './lib/news-digest/fetch.ts';
import { fetchStackReleases } from './lib/news-digest/releases.ts';
import {
	addItems,
	assertDay,
	knownBefore,
	parseNewItems,
	previousAdvisoriesEnd,
	readState,
	recordAdvisoriesEnd,
	writeState,
} from './lib/news-digest/state.ts';
import { validateDigest } from './lib/news-digest/validate.ts';

export const DIGEST_DIR = 'D:\\applications\\.news-digest';

/** The subfolder of the digest folder that holds the daily `<YYYYMMDD>.md` files. */
const NEWS_DIR = 'news';

export interface DigestOptions {
	chars?: string | undefined;
	count?: string | undefined;
	date?: string | undefined;
	dir?: string | undefined;
	end?: string | undefined;
	file?: string | undefined;
	start?: string | undefined;
}

type Print = (line: string) => void;

function required(value: string | undefined, flag: string): string {
	if (!value) throw new Error(`--${flag} is required`);
	return value;
}

async function runAdvisories(
	options: DigestOptions,
	fetchFn: FetchFn,
	print: Print,
	statePath: string,
): Promise<number> {
	const state = await readState(statePath);
	const asked = required(options.start, 'start');
	const start = asked === 'previous' ? previousAdvisoriesEnd(state) : asked;
	const end = required(options.end, 'end');
	const result = await fetchAdvisories(start, end, fetchFn);
	print(`# query: ${result.query}`);
	if (asked === 'previous') print(`# window starts at the previous run's recorded end: ${start}`);
	print(`# pages read: ${result.pages}`);
	print(`# count returned by API for window: ${result.returned}`);
	print(`# lines listed below: ${result.lines.length}`);
	for (const line of result.lines) print(formatAdvisoryLine(line));
	if (result.returned !== result.lines.length) return 1;
	// Only a complete listing moves the mark, so an incomplete run's window is queried again. The
	// state is read again here, not reused from before the fetch, so an item added meanwhile stays.
	const latest = await readState(statePath);
	const next = recordAdvisoriesEnd(latest, start, end);
	if (next === latest) print(`# recorded end unchanged: ${latest.advisoriesThrough ?? 'none'}`);
	else await writeState(statePath, next);
	return 0;
}

async function runReleases(
	options: DigestOptions,
	fetchFn: FetchFn,
	print: Print,
): Promise<number> {
	const repos = await fetchStackReleases(
		required(options.start, 'start'),
		required(options.end, 'end'),
		fetchFn,
	);
	let found = 0;
	for (const repo of repos) {
		const latest = repo.latestStable ? `latest stable ${repo.latestStable.tag}` : 'no stable';
		if (repo.error) print(`${repo.repo}: ERROR ${repo.error}`);
		else if (repo.inWindow.length === 0) print(`${repo.repo}: none in window; ${latest}`);
		for (const release of repo.inWindow) {
			const pre = release.prerelease ? ' (prerelease)' : '';
			print(
				`${repo.repo}: ${release.tag}${pre} published ${release.publishedAt} ${release.url}`,
			);
		}
		found += repo.inWindow.length;
	}
	print(`# total in window: ${found}`);
	return 0;
}

async function runState(
	action: string | undefined,
	options: DigestOptions,
	statePath: string,
	print: Print,
): Promise<number> {
	const day = assertDay(required(options.date, 'date'));
	const state = await readState(statePath);
	if (action === 'known') {
		for (const item of knownBefore(state, day)) print(`${item.firstReported} ${item.url}`);
		return 0;
	}
	if (action !== 'add') throw new Error('state takes "known" or "add"');
	const items = parseNewItems(await readFile(required(options.file, 'file'), 'utf8'));
	const result = addItems(state, day, items);
	await writeState(statePath, result.state);
	print(
		`added ${result.added}, already recorded ${result.alreadyRecorded}, pruned ${result.pruned}`,
	);
	return 0;
}

async function runArchive(options: DigestOptions, dir: string, print: Print): Promise<number> {
	const day = assertDay(required(options.date, 'date'));
	const result = await archiveOldDigests(join(dir, NEWS_DIR), day);
	for (const name of result.moved) print(`moved ${name} to ${NEWS_DIR}/archive/`);
	for (const name of result.skipped) print(`left ${name}: ${NEWS_DIR}/archive/ already has it`);
	print(`archived ${result.moved.length}, left ${result.skipped.length}`);
	return result.skipped.length === 0 ? 0 : 1;
}

async function runValidate(options: DigestOptions, dir: string, print: Print): Promise<number> {
	const day = assertDay(required(options.date, 'date'));
	const file = join(dir, NEWS_DIR, `${day.replaceAll('-', '')}.md`);
	const problems = validateDigest(await readFile(file, 'utf8'), day);
	for (const problem of problems) print(`FAIL ${problem}`);
	if (problems.length === 0) print(`OK ${file}`);
	return problems.length === 0 ? 0 : 1;
}

async function runPage(
	command: string,
	url: string | undefined,
	options: DigestOptions,
	fetchFn: FetchFn,
	print: Print,
): Promise<number> {
	const target = required(url, 'url');
	if (command === 'feed') {
		const xml = await fetchText(
			target,
			fetchFn,
			'application/rss+xml, application/atom+xml, */*',
		);
		for (const entry of parseFeed(xml, Number(options.count ?? 40))) {
			print(`${entry.title} | ${entry.link} | ${entry.date}`);
		}
		return 0;
	}
	const html = await fetchText(target, fetchFn, 'text/html,application/xhtml+xml');
	print(htmlToText(html, Number(options.chars ?? 4000)));
	return 0;
}

/** Run one subcommand; returns the process exit code. */
export async function runDigestCommand(
	positionals: string[],
	options: DigestOptions,
	fetchFn: FetchFn = boundedFetch(),
	print: Print = (line) => console.log(line),
): Promise<number> {
	const [command, argument] = positionals;
	const dir = options.dir ?? DIGEST_DIR;
	switch (command) {
		case 'advisories':
			return await runAdvisories(options, fetchFn, print, join(dir, 'last-digest.json'));
		case 'archive':
			return await runArchive(options, dir, print);
		case 'article':
		case 'feed':
			return await runPage(command, argument, options, fetchFn, print);
		case 'releases':
			return await runReleases(options, fetchFn, print);
		case 'state':
			return await runState(argument, options, join(dir, 'last-digest.json'), print);
		case 'validate':
			return await runValidate(options, dir, print);
		default:
			throw new Error(
				`Unknown command "${command ?? ''}"; see the header of scripts/news-digest.ts`,
			);
	}
}

if (import.meta.main) {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			chars: { type: 'string' },
			count: { type: 'string' },
			date: { type: 'string' },
			dir: { type: 'string' },
			end: { type: 'string' },
			file: { type: 'string' },
			start: { type: 'string' },
		},
	});
	try {
		exit(await runDigestCommand(positionals, values));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		exit(2);
	}
}
