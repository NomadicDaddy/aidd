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
