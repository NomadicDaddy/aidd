/**
 * Appended to every bash workspace-policy denial. Without it a rejection reads as an ordinary
 * command failure, so agents retry the same intent in a new spelling: one run spent 24 minutes and
 * a flailing exit cycling `/d/...` paths, `which`, and `bunx` before accepting the boundary was
 * real. Naming the denial as fixed policy ends that loop on the first hit, and the last sentence
 * gives the agent the exit it lacked — a task that cannot be done inside the workspace is
 * reportable, not something to keep probing at.
 */
const policyIsFinalNote =
	'This is a fixed policy of the aidd agent runtime — not a permissions, path-spelling, or ' +
	'environment problem — and it will not succeed on retry. Do not probe for a way around it. ' +
	'Treat the workspace root as the hard edge of what this run can reach and continue with the ' +
	'work that is reachable inside it. If the task genuinely cannot be completed within the ' +
	'workspace, say so plainly in your completion summary instead of continuing to probe.';

/**
 * Separated by a blank line rather than punctuation: several violations end in the offending path,
 * where a trailing period reads as part of it.
 */
export function denialMessage(violation: string): string {
	return `${violation}\n\n${policyIsFinalNote}`;
}

/**
 * Recognize a policy denial in a tool result so the run log can show it.
 *
 * The run log renders `tool_call` events, which are emitted when the model *requests* a tool —
 * before the policy check runs — and it drops results entirely. A denied command and an executed
 * one therefore looked identical in the transcript, which is why establishing that no native run
 * had ever reached the aidd CLI took replaying historical commands through this module instead of
 * just reading the log. Matching the trailer (rather than an `ERROR:` prefix) keeps this to
 * genuine denials and away from ordinary non-zero command output.
 */
export function isWorkspacePolicyDenial(result: unknown): boolean {
	return typeof result === 'string' && result.includes(policyIsFinalNote);
}

/** The violation line alone — the trailer is boilerplate and would bury the log in prose. */
export function denialSummary(result: string): string {
	return (result.split('\n')[0] ?? result).trim();
}
