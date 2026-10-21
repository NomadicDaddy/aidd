/**
 * The network and text plumbing every news-digest step shares. Each caller takes a `FetchFn`, so
 * the tests drive the steps with canned responses and never touch the network.
 */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const BROWSER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Headers for the GitHub REST API. A token in GH_TOKEN or GITHUB_TOKEN raises the rate limit; it is
 * read here at use time and never printed.
 */
export function githubHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
	const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
	return {
		accept: 'application/vnd.github+json',
		'user-agent': 'aidd-news-digest',
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
}

/** The URL a GitHub `Link` header names as rel="next", or null on the last page. */
export function nextLink(link: null | string): null | string {
	if (!link) return null;
	return /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
}

/** Fetch a page as a browser would ask for it, and fail loudly on anything but a 2xx. */
export async function fetchText(url: string, fetchFn: FetchFn, accept: string): Promise<string> {
	const response = await fetchFn(url, { headers: { accept, 'user-agent': BROWSER_AGENT } });
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
	return await response.text();
}

const ENTITIES: Record<string, string> = {
	'&#39;': "'",
	'&amp;': '&',
	'&apos;': "'",
	'&gt;': '>',
	'&lt;': '<',
	'&nbsp;': ' ',
	'&quot;': '"',
};

function decodeEntities(text: string): string {
	return text
		.replace(/&(?:#39|amp|apos|gt|lt|nbsp|quot);/g, (entity) => ENTITIES[entity] ?? entity)
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Readable text from an HTML page: scripts, styles and tags removed, whitespace collapsed. */
export function htmlToText(html: string, maxChars: number): string {
	const text = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<\/(p|h\d|li|div|br)>/gi, '\n')
		.replace(/<[^>]+>/g, ' ');
	const collapsed = decodeEntities(text)
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line.length > 0)
		.join('\n');
	return collapsed.slice(0, maxChars);
}

export interface FeedEntry {
	date: string;
	link: string;
	title: string;
}

function tagText(block: string, tag: string): string {
	const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
	const raw = match?.[1] ?? '';
	return decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}

function entryLink(block: string): string {
	const atom = /<link[^>]*href="([^"]+)"/i.exec(block)?.[1];
	return atom ?? tagText(block, 'link');
}

/** Title, link and date for each RSS `<item>` or Atom `<entry>`, in feed order. */
export function parseFeed(xml: string, count: number): FeedEntry[] {
	const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
	return blocks.slice(0, count).map((block) => ({
		date:
			tagText(block, 'pubDate') ||
			tagText(block, 'published') ||
			tagText(block, 'updated') ||
			tagText(block, 'dc:date'),
		link: entryLink(block),
		title: tagText(block, 'title'),
	}));
}
