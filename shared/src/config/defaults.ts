import type { ResolvedConfig, ResolvedWebConfig } from './types.ts';

import { defaultIgnoredFolders } from './schema.ts';

export const defaults: ResolvedConfig = {
	auditsEnabled: true,
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	// Two consecutive silent provider-timeout retries, then give up — a non-streaming or stalled
	// provider must not spin up fresh agents indefinitely when maxIterations is unlimited. Set to 0
	// to disable the cap (falls back to the iteration limit).
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: null,
	noClean: false,
	noWorkBackoffMs: 30_000,
	preflightDoctor: true,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 10800,
	web: {
		allowedOrigins: [],
		allowedRoots: [],
		allowRemote: false,
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir: '',
		hostname: '127.0.0.1',
		ignoredFolders: [...defaultIgnoredFolders],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		useWorktrees: false,
	},
};

export const defaultWebConfig: ResolvedWebConfig = {
	allowedOrigins: [],
	allowedRoots: [],
	allowRemote: false,
	autoChainLimit: 3,
	autoChainRuns: false,
	dataDir: '',
	hostname: '127.0.0.1',
	ignoredFolders: [...defaultIgnoredFolders],
	maxConcurrentRuns: 2,
	maxConcurrentRunsPerProject: 2,
	port: 3210,
	showSpernakitProject: false,
	spernakitFleetManifest: null,
	spernakitInitScript: null,
	spernakitTemplateRef: null,
	spernakitTemplateRepo: 'NomadicDaddy/spernakit',
	templates: [],
	traceDataMovement: false,
	useWorktrees: false,
};

// 45s was too tight for the directorCycle surface, which sends the full
// fleet summary (tens of thousands of tokens) at high reasoning effort; a
// single timeout there aborts the whole cycle. 120s gives the heaviest surface
// room to finish while still bounding hung requests. Override per-install via
// directAi.timeoutSeconds.
export const defaultDirectAiTimeoutSeconds = 120;

// Cadence the built-in Director scheduled task is seeded with when config.json names none: twice a
// day, as '0 */12 * * *'. Read once at seeding time; after that the task's own cron is the cadence,
// editable on the Scheduled page.
export const defaultDirectorIntervalHours = 12;

// Director suggestion shaping. 'targeted' makes each cycle surface concrete,
// individually-runnable next actions (one per artifact, top N per bucket) plus a
// rollup for the remainder, instead of one sweeping "resolve the whole backlog"
// suggestion. Override per-install via director.suggestions.*.
export const defaultDirectorSuggestionGranularity = 'targeted' as const;
export const defaultDirectorMaxPerBucket = 3;

// Suggestion auto-launch. Off, and tight when on: one suggestion, only the one this cycle ranked
// first, and only at the lowest risk level. These are the bounds an operator relaxes deliberately,
// not a starting point to be tuned upward by default — every one of them is the difference between
// aidd doing one bounded thing overnight and aidd working through a backlog unattended.
export const defaultDirectorAutoLaunchEnabled = false;
export const defaultDirectorAutoLaunchMaxPerCycle = 1;
export const defaultDirectorAutoLaunchMaxRank = 1;
export const defaultDirectorAutoLaunchRiskCeiling = 'LOW' as const;

// Which recipes the Director may start on its own. An allow-list rather than a blanket rule,
// because the six recipes prioritized work names differ by an order of magnitude in what they set
// off: `coding` is four flat steps against one named feature, while `project-intake` is nine steps
// containing five nested recipes. The three below are the targeted ones — they take a single
// artifact as an argument and finish. `audit-all`, `project-intake`, and
// `reconcile-project-artifacts` are deliberately absent: each works a whole project rather than one
// named thing, and one of this cycle's places should not buy that much.
//
// Absence from this list is a refusal, which is also what makes a recipe name the model invented
// safe by construction: `coding-native` appears 521 times in real cycle output and matches no
// recipe file at all.
export const defaultDirectorAutoLaunchAllowedRecipes: readonly string[] = [
	'coding',
	'remediate-audit-findings',
	'remediate-bugs',
];
