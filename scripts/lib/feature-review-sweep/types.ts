/**
 * A feature blueprint as it exists on disk. Every field is `unknown` because the sweep's
 * entire purpose is to inspect and repair files that do not yet conform to the schema —
 * typing them optimistically would assume the invariant this script exists to enforce.
 */
export type FeatureJson = Record<string, unknown>;

export type StatusBucket = 'backlog' | 'completed' | 'other' | 'verified';

export interface DiscoveredApp {
	featuresDir: string;
	name: string;
	root: string;
}

export interface FeatureRecord {
	actions?: string[];
	changed?: boolean;
	dir: string;
	filePath: string;
	finalJson?: FeatureJson | null;
	indent: string;
	initiallyInvalid: boolean;
	json: FeatureJson | null;
	manualFollowUps?: string[];
	newline: string;
	nextText?: string;
	parseError: null | string;
	rawText: string;
	wasRepaired: boolean;
}

export interface GitStatus {
	ok: boolean;
	paths: string[];
	raw: string;
}

export interface InventorySummary {
	backlog: number;
	completed: number;
	invalidJson: number;
	legacyAcceptanceCriteria: number;
	legacyFileLocations: number;
	missingDependencies: number;
	mixedSchema: number;
	orphanDirs: number;
	other: number;
	total: number;
	verified: number;
}

export interface NormalizeContext {
	dir: string;
	dirMap: Map<string, string>;
	id: string;
	idMap: Set<string>;
	titleMap: Map<string, string[]>;
}

export interface NormalizeResult {
	actions: string[];
	json: FeatureJson;
	manualFollowUps: string[];
}

export interface ParseResult {
	error?: string;
	json: FeatureJson | null;
	repaired: boolean;
	text: string;
}

export interface SchemaAnalysis {
	legacyAcceptanceCriteria: boolean;
	legacyFileLocations: boolean;
	missingDependencies: boolean;
	mixedSchema: boolean;
}

export interface SweepOptions {
	apps: null | Set<string>;
	depth: string;
	dryRun: boolean;
	fixMode: string;
	reportOnly: boolean;
}

export interface ValidatorResult {
	ok: boolean;
	reason?: string;
	skipped: boolean;
	status?: null | number;
	stderr?: string;
	stdout?: string;
}

/** A commit to a record's files, made well after the record was last edited. */
export interface RecordChange {
	commit: string;
	committedAt: string;
	lagDays: number;
	subject: string;
}

export interface RecordStaleness {
	changedSince: ({
		/** How many of the record's own files have a later commit. */
		filesMoved: number;
		id: string;
		/** Files that this record names and no other record does. */
		ownFiles: number;
		status: string;
		updatedAt: string;
	} & RecordChange)[];
	/** Records compared against history, whether or not a later commit was found. */
	checked: number;
	notChecked: { id: string; reason: string }[];
	/** Set when nothing in the application could be checked at all. */
	reason: null | string;
}

export interface AppSummary {
	after: InventorySummary;
	app: DiscoveredApp;
	autoClosedRedundant: number;
	backlogSemanticFixes: number;
	before: InventorySummary;
	complianceFixes: number;
	duplicateHints: string[][];
	invalidJsonRepairs: number;
	manualFollowUps: string[];
	mode: string;
	options: SweepOptions;
	recordStaleness: RecordStaleness;
	removedOrphanDirs: number;
	reportsWritten: number;
	touchedFeatureFiles: number;
	unsafeDiffs: string[];
	validator: ValidatorResult;
}

export interface RunTotals {
	autoClosedRedundant: number;
	backlogSemanticFixes: number;
	complianceFixes: number;
	invalidJsonRepairs: number;
	manualFollowUps: number;
	totalFeatures: number;
	unsafeDiffs: number;
}

export interface RunSummary {
	apps: AppSummary[];
	mode: string;
	options: SweepOptions;
	totals: RunTotals;
}
