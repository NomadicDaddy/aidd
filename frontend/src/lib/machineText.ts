/**
 * For a field that holds a path, URL, model id, host, cron expression or CLI arguments: text a
 * machine reads, not prose a person writes.
 *
 * Left to the browser's defaults these fields were spellchecked, so Chrome underlined every
 * application root, base URL and `0 2 * * 1-5` as misspellings, and mobile keyboards capitalised
 * the first letter of a path. Prose fields - the directive, a spec description - keep spellcheck.
 */
export const machineTextProps = {
	autoCapitalize: 'off',
	autoCorrect: 'off',
	spellCheck: false,
} as const;
