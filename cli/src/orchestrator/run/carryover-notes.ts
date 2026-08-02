// Notes injected into the *next* iteration's prompt, alongside the compiled mode prompt. They are
// runtime instructions to the agent, so they compete with prompts/coding.md — any guidance here
// must agree with that prompt's result contract, especially on when AIDD_RESULT may be emitted.
// The marker means "completed and verified"; there is no marker shape for parked or partial work.

// Corrective note injected after a flailing trip, so the agent sees the feedback at the start of its
// retry instead of repeating the loop. This is the blocked-server scenario the STOP-AND-PARK hatch
// exists for, so it must route to a park — never to a completion marker the agent cannot stand behind.
export function flailingNudgeNote(): string {
	return (
		'**Heads-up: your previous attempt was stopped for flailing.** You repeated the same ' +
		'non-productive actions (e.g. probing ports, listing processes, or trying to start a server) ' +
		'many times without making any file changes. Do not do that again:\n\n' +
		'- Do **not** hunt for or start a server. If the run launch context names a live app URL, that ' +
		'instance is already running — reuse it. A failed `curl`/`ps` probe is not proof nothing is ' +
		'listening.\n' +
		'- If you cannot verify the UI via `agent-browser`/`curl` after one more honest attempt, run the ' +
		'headless gates (`bun run smoke:qc`, typecheck, lint), document the manual ' +
		'verification steps in `/.aidd/CHANGELOG.md`, mark the feature `waiting_approval` (`passes: false`), ' +
		'and say plainly that the live verification was blocked. Do **not** emit `AIDD_RESULT` for parked ' +
		'work — the marker means "completed and verified", and aidd records the park from the feature ' +
		'status plus your stated blocker.\n' +
		'- Otherwise, make concrete progress (edit files) toward completing the selected feature.'
	);
}

// Baseline-gate skip injected when the previous iteration of this run already proved the tree
// green: it exited clean with an accepted completion, and nothing has changed on disk since. The
// mode prompts open with a full pre-implementation quality gate (STEP 4), which on a large project
// costs minutes of every iteration to re-establish a fact aidd already holds. Only the *pre*-work
// gate is waived — the post-change gate before committing is untouched, and the note names the sha
// so the agent can self-invalidate if it finds the tree somewhere else.
export function baselineVerifiedNote(headSha: string): string {
	return (
		'**Baseline already verified — skip the pre-implementation quality gate.** The previous ' +
		`iteration of this run finished clean at commit \`${headSha}\`, and the working tree has not ` +
		'changed since. Treat STEP 4 (RUN QUALITY CHECKS) as satisfied for this baseline:\n\n' +
		'- Do **not** run `smoke:qc`, `smoke:dev`, or a standalone lint/typecheck/test sweep before ' +
		'you start work. Go straight to selecting and implementing the feature.\n' +
		'- The gate you still owe is the **post-change** one: after your edits, run the fast checks ' +
		'before you commit, commit, then run the full quality gate after the commit and fold any ' +
		'fixes in with `--amend` — exactly the Step 10.2 → 10.3 → 10.4 order the prompt requires. ' +
		'Nothing about the completion bar has been relaxed.\n' +
		`- This note is void if reality disagrees: if \`git status\` is dirty or \`HEAD\` is not ` +
		`\`${headSha}\`, ignore it and run the baseline gate normally.`
	);
}

// Raised after an iteration marked a feature outside its allowed set complete. The first overrun
// ends the iteration, not the run (see post-iteration-guards), so the agent has to be told what it
// did — otherwise the next iteration repeats it and the second one does end the run.
export function scopeOverrunNote(extraCompletedFeatures: readonly string[]): string {
	return (
		'**Heads-up: your previous iteration completed a feature it was not assigned.** These ' +
		`feature records became \`completed\`/\`passes: true\` outside the selected scope: ` +
		`${extraCompletedFeatures.map((id) => `\`${id}\``).join(', ')}.\n\n` +
		'- Only the feature named in your work assignment may have its `id`, `status`, or `passes` ' +
		"changed. Amending another feature's `spec`, `notes`, or `dependencies` is expected and " +
		'encouraged; flipping its completion state is not.\n' +
		'- If you did not intend to complete it, set it back to its true status now.\n' +
		'- A second scope overrun in this run ends the run.'
	);
}

// Raised when a feature.json will not parse at the end of an iteration. aidd's own listings drop
// unreadable records silently, so the feature is invisible — to selection, to stats, and to the
// next agent — until someone repairs the file. Repair comes before new work.
export function invalidFeatureMetadataNote(
	failures: readonly { directory: string; message: string }[],
): string {
	const lines = failures.map(
		(failure) =>
			`  - \`.aidd/features/${failure.directory}/feature.json\` — ${failure.message}`,
	);
	return (
		'**Repair the invalid feature metadata before doing anything else.** These records exist on ' +
		'disk but do not parse as JSON, so aidd cannot see the features at all — they are missing ' +
		'from selection, from the queue, and from every count:\n\n' +
		`${lines.join('\n')}\n\n` +
		'- Fix the JSON, then confirm each file with `bun -e "JSON.parse(await Bun.file(PATH).text())"` ' +
		'before moving on.\n' +
		'- The usual cause is a text edit that put a raw newline, tab, or unescaped backslash inside ' +
		'a JSON string value. When you amend `spec` or `notes`, write `\\n` (two characters), never a ' +
		'literal line break, and re-parse the file immediately after every edit.\n' +
		'- Do not recreate a record from scratch to make it parse: preserve the existing `id`, ' +
		'`status`, `passes`, and history, and repair only the malformed text.'
	);
}

// Raised when the feature collection fails its contract validation at the end of an iteration.
// aidd validates every record itself at run end, but a run-end report the agent never sees only
// tells the operator afterwards; the skills used to run `--check-features` mid-run precisely so the
// agent could repair what it broke. This is that loop, restored on aidd's side: the same check, run
// where the one party who can fix it is still working. Capped, because a long-standing pre-existing
// issue must not crowd out the assignment.
const MAX_LISTED_CONTRACT_ISSUES = 8;

export function featureContractIssuesNote(
	issues: readonly { id: string; message: string }[],
): string {
	const listed = issues.slice(0, MAX_LISTED_CONTRACT_ISSUES);
	const lines = listed.map((issue) => `  - \`${issue.id}\` — ${issue.message}`);
	const elided = issues.length - listed.length;
	return (
		`**The feature metadata does not satisfy its contract (${issues.length} issue(s)).** aidd ` +
		'validated every record after your last iteration and these failed:\n\n' +
		`${lines.join('\n')}${elided > 0 ? `\n  - …and ${elided} more` : ''}\n\n` +
		'- Repair these records as part of this iteration. A broken contract is real damage: ' +
		'dependency edges that point nowhere, duplicate ids, and out-of-vocabulary statuses all ' +
		'corrupt selection for every later run.\n' +
		'- If an issue predates your work and repairing it is genuinely outside your assignment, ' +
		'say so in your summary rather than silently leaving it. Do not edit an unrelated ' +
		"feature's `status` or `passes` to make a message go away.\n" +
		'- You do not need to run a validation command: aidd re-checks the whole collection after ' +
		'every iteration and this note will not come back once the records are clean.'
	);
}

// Raised when audit mode rejected one or more reports for failing the result contract. The audit
// stays in the retry queue (iteration-outcome preserves exit 0 for exactly this), but without the
// reasons the retry is a blind re-roll: the agent re-runs the same audit with no idea which part of
// its report was refused. This is the same loop featureContractIssuesNote closes for feature
// metadata — the validator's own words, handed to the one party who can act on them.
const MAX_LISTED_REJECTED_REPORTS = 8;

export function rejectedAuditReportsNote(
	invalid: readonly { auditName?: string; reason: string }[],
): string {
	const listed = invalid.slice(0, MAX_LISTED_REJECTED_REPORTS);
	const lines = listed.map(
		(report) => `  - \`${report.auditName ?? 'unnamed report'}\` — ${report.reason}`,
	);
	const elided = invalid.length - listed.length;
	return (
		`**${invalid.length} audit report(s) from your last iteration were rejected and were NOT ` +
		'persisted.** aidd validated each report against the result contract and these failed:\n\n' +
		`${lines.join('\n')}${elided > 0 ? `\n  - …and ${elided} more` : ''}\n\n` +
		'- These audits are still pending and have been re-selected for you. Re-emit a report for ' +
		'each one, fixing the stated problem — a rejected report persists nothing, so the audit has ' +
		'no fresh evidence until it passes.\n' +
		'- A rejection is about the *shape* of the report, not the truth of your conclusion. If you ' +
		'genuinely found nothing, keep that conclusion and make the evidence concrete: name the ' +
		'files, globs, or commands you inspected and what came back.\n' +
		'- Do not invent a finding to escape a rejected empty report. A fabricated finding is a worse ' +
		'outcome than a pending audit.'
	);
}

// Deadline warning injected when the run's wall-clock budget is nearly exhausted, so the agent lands
// its in-flight work instead of being hard-killed mid-commit (a timeout abort leaves a dirty worktree
// that poisons the next run's gates). A deadline does not lower the bar for the marker.
export function windDownNote(remainingMs: number): string {
	const remainingMinutes = Math.max(1, Math.floor(remainingMs / 60000));
	return (
		`**Heads-up: about ${remainingMinutes} minute(s) of wall-clock budget remain before this run is force-stopped.** ` +
		'Wind down now:\n\n' +
		'- Do **not** expand scope or open new lines of investigation. If this iteration just handed ' +
		"you a feature to start, aidd checked the remaining budget against how long this run's " +
		'iterations have been taking before dispatching it — do that one thing and nothing more.\n' +
		'- Finish or safely checkpoint the change you are in the middle of, run the required gates, and ' +
		'`git commit` completed work immediately.\n' +
		'- Update the feature `feature.json` to its true status (completed+passing only if the gates ran ' +
		'clean; otherwise leave it honest). Emit `AIDD_RESULT` before the deadline **only** if the ' +
		'feature is genuinely completed and verified; for anything less, leave the status honest and ' +
		'emit no marker — a deadline is not a reason to claim a completion.\n' +
		'- Leaving uncommitted changes behind will block the next run.'
	);
}
