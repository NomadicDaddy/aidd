/**
 * What a Director suggestion may carry as `suggestedArgs`.
 *
 * Suggestions are written by a model, and the model reads text that comes out of the target
 * repositories (feature titles, finding text), so a suggestion's arguments are untrusted input.
 * They become recipe parameters, and recipes substitute parameters into shell steps without
 * quoting (`deploy.json` runs `{deployCommand}` whole). A suggestion therefore keeps only the
 * targeting keys that name existing work, with values that cannot leave a shell word. Anything
 * else, including recipe built-ins such as `application`, is dropped. A person who wants to pass
 * other parameters launches the recipe directly, where they type the values themselves.
 */
const SUGGESTED_ARG_KEYS: readonly string[] = [
	'auditAll',
	'auditNames',
	'feature',
	'filterBy',
	'filterValue',
];

/** Feature ids, audit names and their comma lists, `audit-*` style globs, and `true`. */
const SUGGESTED_ARG_VALUE = /^[A-Za-z0-9][A-Za-z0-9._*:,-]{0,199}$/;

/** Keeps only the allowed targeting args with safe values; everything else is dropped. */
export function filterSuggestedArgs(args: Record<string, unknown>): Record<string, string> {
	const kept: Record<string, string> = {};
	for (const [key, value] of Object.entries(args)) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (SUGGESTED_ARG_KEYS.includes(key) && SUGGESTED_ARG_VALUE.test(trimmed))
			kept[key] = trimmed;
	}
	return kept;
}
