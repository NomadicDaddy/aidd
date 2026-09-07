// The backend × mode matrix behind the prompt snapshot drift gate (see runSnapshotTest in
// compile.ts). Kept in its own module so the completeness tests can assert the matrix
// against the live backend and phase inventories instead of trusting it by review.
//
// ollama, lmstudio, and openai are deliberately absent from snapshotBackends: all three run
// through NativeBackend and resolve to the same prompts/_cli/native.md fragment, so their
// compiled prompts are byte-identical to the native snapshots. That parity is locked by
// test/cli/snapshot-matrix.test.ts — a backend that stops resolving to native.md must
// either join this list or fail that test.
export const snapshotBackends = [
	'native',
	'claude-code',
	'opencode',
	'kilocode',
	'codex',
	'cline',
	'grok',
] as const;

// Mirror the web Director's app-data cycle directory so the reviewable examples do not teach
// callers to create unclassified runtime artifacts in project-owned .aidd metadata.
const directorSnapshotDir = 'data/director';

export interface SnapshotMode {
	args: string[];
	name: string;
	phase?: string;
}

export const snapshotModes: SnapshotMode[] = [
	{ args: [], name: 'coding' },
	// Initializer/onboarding are state-detected phases with no CLI flag (see
	// applyInitialPhaseDetection in preflight.ts); replicate its phase-fragment rewrite here so
	// their prompt sources are covered by the drift gate like every other phase.
	{ args: [], name: 'initializer', phase: 'initializer' },
	{ args: [], name: 'onboarding', phase: 'onboarding' },
	{ args: ['--in-progress'], name: 'in-progress' },
	{ args: ['--todo'], name: 'todo' },
	{ args: ['--validate'], name: 'validate' },
	{ args: ['--audit', 'SECURITY'], name: 'audit' },
	{ args: ['--interview'], name: 'interview' },
	{
		args: [
			'--director',
			'--fleet-summary',
			`${directorSnapshotDir}/snapshot-fleet-summary.json`,
			'--director-output',
			`${directorSnapshotDir}/snapshot-output.json`,
		],
		name: 'director',
	},
	{
		args: ['--prompt', 'Refactor src/example.ts to extract a helper function.'],
		name: 'directive-mutation',
	},
	{
		args: [
			'--prompt',
			'Review src/example.ts and report any inconsistencies.',
			'--directive-readonly',
		],
		name: 'directive-readonly',
	},
];
