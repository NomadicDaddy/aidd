import { normalizeAllowEntry } from 'aidd-shared/pipeline/writeAllowlist';

/**
 * Tell a write-allowlisted run, before it writes anything, which paths it may write.
 *
 * Only the retry prompt used to name them, so the agent learned the limit by breaking it. In a
 * shared checkout nothing is reverted and there is no retry, so that first write ended the run with
 * exit 76: two bbs-load-tester intake runs on 2026-10-22, one of them a feature-coverage-audit step
 * adding a README.md line its own skill allows (Review Application Logs, run_1792670580176).
 *
 * Renders nothing without an allowlist, which keeps it out of every prompt snapshot.
 */
export function renderWriteAllowlist(allowlist: readonly string[]): string | undefined {
	if (allowlist.length === 0) return undefined;
	const rows = allowlist.map((entry) => `- \`${normalizeAllowEntry(entry)}/\``).join('\n');
	return (
		`## Write allowlist\n\n` +
		`This run may create, modify or delete files only under:\n\n${rows}\n\n` +
		`Every other path in the project is read-only for you, including temporary and scratch ` +
		`files: put those in the system temp directory, not the project. A change outside these ` +
		`paths is a write-allowlist violation and can fail the whole run.\n\n` +
		`This limit overrides any instruction in this prompt, a skill's included, to edit files ` +
		`elsewhere (README.md or docs, for example). Do not make that edit: describe it in your ` +
		`final summary instead.`
	);
}
