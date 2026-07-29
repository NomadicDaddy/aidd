/** Liveness of the launcher-managed app address, as probed by the orchestrator just before the
 * iteration's prompt was compiled. `unknown` means no probe ran (the address was supplied but not
 * checked); the prompt then states the address without asserting whether it answers. */
export type AppUrlStatus = 'live' | 'unknown' | 'unreachable';

export interface LaunchContextOptions {
	aiddMetadataUntracked?: boolean;
	appUrl?: string;
	appUrlStatus?: AppUrlStatus;
	carryoverNote?: string;
}

// Stated up front because it is not discoverable cheaply: `git log`/`git show HEAD:` on a
// gitignored path returns nothing, which reads as "this file has no history" rather than "this
// file is not tracked here", so agents re-derive it with two or three commands every iteration.
function renderUntrackedMetadata(): string {
	return (
		`This project's \`.aidd/\` metadata is **not tracked by git** here — \`feature.json\`, ` +
		`\`CHANGELOG.md\`, and the run artifacts are gitignored. The files on disk are the only ` +
		`record of feature state, and they are authoritative. Do not run \`git log\`, ` +
		`\`git show HEAD:\`, \`git ls-files\`, or \`git check-ignore\` against \`.aidd/\` paths to ` +
		`recover history or confirm this — there is none to recover. Read and write the files ` +
		`directly, and commit only source and tests.`
	);
}

// Deliberately project-agnostic: this block is sent for any project whose app address is known, not
// just the aidd panel, so it must not name aidd's own scripts. The address itself is the point —
// without it agents fall back to framework defaults (localhost:3000, :5173) and burn the run probing
// ports the app was never on.
//
// The scope sentence is load-bearing. Worded as a flat ban on starting a server, this block read as
// a veto on the project's OWN gates: a fleet release refused to run its release script (which
// rebuilds and restarts the app as part of its own run, then stops it) and parked the whole
// pipeline, citing this text. The prohibition is about how you REACH the app under test, not about
// which scripts may execute.
function renderLiveApp(appUrl: string): string {
	return (
		`The application under test for this project is at ${appUrl}. Use that address for ` +
		`live verification (curl / agent-browser). Do **not** probe other ports, hunt for a ` +
		`listening process, or launch your own instance (\`start\` / \`dev\` / \`start:web\`) to ` +
		`verify against — if this address does not respond, the app is not running, and no other ` +
		`port is a substitute. That bounds how you reach this app; it does not veto the project's ` +
		`own scripted gates. A test, QC, or release script that starts and stops a server as part ` +
		`of its own run is ordinary work — run it when the task calls for it. ` +
		`If \`agent-browser\` is unavailable or you cannot reach the app after two honest attempts, ` +
		`run the headless gates you can (typecheck, lint, tests, the project's QC script) and mark ` +
		`the feature \`waiting_approval\` with the manual verification steps documented.`
	);
}

// Runs that inherit a dead app address used to spend most of an iteration rediscovering that fact —
// probing, rebuilding, restarting — before parking. aidd already knows: it probed the address for
// this iteration. State the failure up front and route straight to the park.
function renderUnreachableApp(appUrl: string): string {
	return (
		`The application under test for this project is at ${appUrl}, but aidd probed that address ` +
		`immediately before this iteration and it did **not** respond. Live UI verification is ` +
		`**blocked** for this iteration. Treat that as established fact, not something to ` +
		`re-investigate:\n\n` +
		`- Do **not** start, restart, or rebuild a server to revive it, and do **not** scan other ` +
		`ports or hunt for a listening process. This app was launched outside your session; no ` +
		`other port is a substitute. A test, QC, or release script that manages a server as part ` +
		`of its own run is not an attempt to revive this address — run it when the task calls ` +
		`for it.\n` +
		`- One confirming \`curl\` is the entire budget for re-checking. If it answers now, proceed ` +
		`normally; if not, stop probing.\n` +
		`- Prefer work that does not need live UI verification. If the selected feature does need ` +
		`it, run every headless gate you can (typecheck, lint, tests, the project's QC script), ` +
		`document the manual verification steps in \`/.aidd/CHANGELOG.md\`, mark the feature ` +
		`\`waiting_approval\` (\`passes: false\`) naming the unreachable app as the blocker, and emit ` +
		`no \`AIDD_RESULT\` — the marker means "completed and verified".`
	);
}

export function renderLaunchContext(options: LaunchContextOptions): string | undefined {
	const parts: string[] = [];
	if (options.appUrl) {
		parts.push(
			options.appUrlStatus === 'unreachable'
				? renderUnreachableApp(options.appUrl)
				: renderLiveApp(options.appUrl),
		);
	}
	if (options.aiddMetadataUntracked) parts.push(renderUntrackedMetadata());
	if (options.carryoverNote) parts.push(options.carryoverNote.trim());
	if (parts.length === 0) return undefined;
	return `## Run launch context\n\n${parts.join('\n\n')}`;
}
