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
		'headless gates (`bun run smoke:qc`, typecheck, lint, `--check-features`), document the manual ' +
		'verification steps in `/.aidd/CHANGELOG.md`, mark the feature `waiting_approval` (`passes: false`), ' +
		'and say plainly that the live verification was blocked. Do **not** emit `AIDD_RESULT` for parked ' +
		'work — the marker means "completed and verified", and aidd records the park from the feature ' +
		'status plus your stated blocker.\n' +
		'- Otherwise, make concrete progress (edit files) toward completing the selected feature.'
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
		'- Do **not** start new features or open new lines of investigation.\n' +
		'- Finish or safely checkpoint the change you are in the middle of, run the required gates, and ' +
		'`git commit` completed work immediately.\n' +
		'- Update the feature `feature.json` to its true status (completed+passing only if the gates ran ' +
		'clean; otherwise leave it honest). Emit `AIDD_RESULT` before the deadline **only** if the ' +
		'feature is genuinely completed and verified; for anything less, leave the status honest and ' +
		'emit no marker — a deadline is not a reason to claim a completion.\n' +
		'- Leaving uncommitted changes behind will block the next run.'
	);
}
