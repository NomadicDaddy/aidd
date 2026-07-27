/** Liveness of the launcher-managed app address, as probed by the orchestrator just before the
 * iteration's prompt was compiled. `unknown` means no probe ran (the address was supplied but not
 * checked); the prompt then states the address without asserting whether it answers. */
export type AppUrlStatus = 'live' | 'unknown' | 'unreachable';

export interface LaunchContextOptions {
	appUrl?: string;
	appUrlStatus?: AppUrlStatus;
	carryoverNote?: string;
}

// Deliberately project-agnostic: this block is sent for any project whose app address is known, not
// just the aidd panel, so it must not name aidd's own scripts. The address itself is the point —
// without it agents fall back to framework defaults (localhost:3000, :5173) and burn the run probing
// ports the app was never on.
function renderLiveApp(appUrl: string): string {
	return (
		`The application under test for this project is at ${appUrl}. Use that address for ` +
		`live verification (curl / agent-browser). Do **not** probe other ports, hunt for a ` +
		`listening process, or start another server (\`start\` / \`dev\` / \`start:web\`) — if this ` +
		`address does not respond, the app is not running, and no other port is a substitute. ` +
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
		`other port is a substitute.\n` +
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
	if (options.carryoverNote) parts.push(options.carryoverNote.trim());
	if (parts.length === 0) return undefined;
	return `## Run launch context\n\n${parts.join('\n\n')}`;
}
