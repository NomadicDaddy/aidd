/**
 * The digest's "Security advisories (npm)" section, built from the GitHub Advisory Database with the
 * window in the request itself. On 2026-10-06 an unfiltered newest-100 page trimmed by hand dropped
 * sharp GHSA-wq5f-xc86-pv6w, which the API had returned; this queries the window and follows every
 * page, and the count the API returned must equal the count listed.
 */
import { type FetchFn, githubHeaders, nextLink } from './fetch.ts';

export interface AdvisoryLine {
	ghsaId: string;
	packages: string[];
	severity: string;
	url: string;
}

export interface AdvisoryResult {
	lines: AdvisoryLine[];
	pages: number;
	query: string;
	returned: number;
}

/** The exact first-page query for a window; the digest prints it as evidence. */
export function advisoryQuery(start: string, end: string): string {
	const window = encodeURIComponent(`${start}..${end}`);
	return `https://api.github.com/advisories?ecosystem=npm&type=reviewed&per_page=100&published=${window}`;
}

interface RawAdvisory {
	ghsa_id?: string;
	html_url?: string;
	severity?: string;
	vulnerabilities?: { package?: { name?: string } }[];
}

function toLine(advisory: RawAdvisory): AdvisoryLine {
	const ghsaId = advisory.ghsa_id ?? '?';
	const names = (advisory.vulnerabilities ?? []).flatMap((v) => v.package?.name ?? []);
	return {
		ghsaId,
		packages: [...new Set(names)],
		severity: advisory.severity ?? '?',
		url: advisory.html_url ?? `https://github.com/advisories/${ghsaId}`,
	};
}

/** Every reviewed npm advisory published in the window, across all pages. */
export async function fetchAdvisories(
	start: string,
	end: string,
	fetchFn: FetchFn,
	env: NodeJS.ProcessEnv = process.env,
): Promise<AdvisoryResult> {
	const query = advisoryQuery(start, end);
	const result: AdvisoryResult = { lines: [], pages: 0, query, returned: 0 };
	let url: null | string = query;
	while (url) {
		const response = await fetchFn(url, { headers: githubHeaders(env) });
		if (response.status !== 200) throw new Error(`HTTP ${response.status} on ${url}`);
		const batch = (await response.json()) as unknown;
		if (!Array.isArray(batch))
			throw new Error(`Advisory API returned a non-list body on ${url}`);
		result.pages += 1;
		result.returned += batch.length;
		result.lines.push(...(batch as RawAdvisory[]).map(toLine));
		url = nextLink(response.headers.get('link'));
	}
	return result;
}

/** One markdown bullet per advisory, in the shape the digest's section uses. */
export function formatAdvisoryLine(line: AdvisoryLine): string {
	const packages = line.packages.length > 0 ? line.packages.join(', ') : '(no package)';
	return `- ${packages} — ${line.severity} — ${line.ghsaId} — ${line.url}`;
}
