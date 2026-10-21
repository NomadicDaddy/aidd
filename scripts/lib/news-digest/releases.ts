/**
 * GitHub releases of the stack the fleet builds on, published inside the digest's window. The
 * digest reports official release notes from here rather than from secondhand coverage.
 */
import { type FetchFn, githubHeaders } from './fetch.ts';

export const STACK_REPOS = [
	'biomejs/biome',
	'drizzle-team/drizzle-orm',
	'elysiajs/elysia',
	'eslint/eslint',
	'facebook/react',
	'microsoft/TypeScript',
	'nodejs/node',
	'oven-sh/bun',
	'prettier/prettier',
	'tailwindlabs/tailwindcss',
	'typescript-eslint/typescript-eslint',
	'vitejs/vite',
] as const;

export interface RepoReleases {
	error?: string;
	inWindow: { prerelease: boolean; publishedAt: string; tag: string; url: string }[];
	latestStable?: { publishedAt: string; tag: string };
	repo: string;
}

interface RawRelease {
	draft?: boolean;
	html_url?: string;
	prerelease?: boolean;
	published_at?: null | string;
	tag_name?: string;
}

function summarize(repo: string, releases: RawRelease[], start: number, end: number): RepoReleases {
	const inWindow = releases
		.filter((r) => r.published_at && Date.parse(r.published_at) > start)
		.filter((r) => Date.parse(r.published_at ?? '') <= end)
		.map((r) => ({
			prerelease: r.prerelease === true,
			publishedAt: r.published_at ?? '',
			tag: r.tag_name ?? '?',
			url: r.html_url ?? `https://github.com/${repo}/releases`,
		}));
	const stable = releases.find((r) => !r.prerelease && !r.draft && r.published_at);
	return {
		inWindow,
		repo,
		...(stable
			? {
					latestStable: {
						publishedAt: stable.published_at ?? '',
						tag: stable.tag_name ?? '?',
					},
				}
			: {}),
	};
}

async function repoReleases(
	repo: string,
	window: { end: number; start: number },
	fetchFn: FetchFn,
	env: NodeJS.ProcessEnv,
): Promise<RepoReleases> {
	try {
		const url = `https://api.github.com/repos/${repo}/releases?per_page=15`;
		const response = await fetchFn(url, { headers: githubHeaders(env) });
		if (response.status !== 200)
			return { error: `HTTP ${response.status}`, inWindow: [], repo };
		const releases = (await response.json()) as RawRelease[];
		return summarize(repo, releases, window.start, window.end);
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : String(err),
			inWindow: [],
			repo,
		};
	}
}

/** Each stack repo's releases in (start, end], plus its latest stable tag for context. */
export async function fetchStackReleases(
	start: string,
	end: string,
	fetchFn: FetchFn,
	env: NodeJS.ProcessEnv = process.env,
	repos: readonly string[] = STACK_REPOS,
): Promise<RepoReleases[]> {
	const window = { end: Date.parse(end), start: Date.parse(start) };
	const results: RepoReleases[] = [];
	for (const repo of repos) results.push(await repoReleases(repo, window, fetchFn, env));
	return results;
}
