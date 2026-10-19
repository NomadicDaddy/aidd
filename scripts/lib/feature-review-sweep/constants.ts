import { FEATURE_STATUSES } from 'aidd-shared/metadata/features';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const AIDD_ROOT = path.resolve(moduleDir, '..', '..', '..');
export const APPLICATIONS_ROOT = path.resolve(AIDD_ROOT, '..');

export const TODAY = new Date().toISOString().slice(0, 10);
export const AGGREGATE_REPORT_PATH = path.join(
	AIDD_ROOT,
	'reports',
	`feature-review-all-${TODAY}.md`,
);

export const SUPPORTED_DEPTH = 'full-backlog-light-completed';
export const SUPPORTED_FIX_MODE = 'aggressive';

// Every canonical status, so a status added to aidd is never reported as invalid here (deferred
// was), plus the legacy values the sweep still meets in older records.
export const VALID_STATUSES = new Set<string>([
	...FEATURE_STATUSES,
	'failed',
	'pending',
	'running',
	'verified',
]);
export const BACKLOG_STATUSES = new Set(['backlog', 'failed', 'in_progress', 'pending', 'running']);
export const COMPLETED_STATUSES = new Set(['completed', 'verified']);

export const REQUIRED_FIELDS = [
	'id',
	'title',
	'description',
	'category',
	'status',
	'passes',
	'priority',
	'spec',
	'dependencies',
];
export const CANONICAL_KEY_ORDER = [
	'id',
	'title',
	'description',
	'category',
	'status',
	'priority',
	'passes',
	'spec',
	'dependencies',
	'createdAt',
	'updatedAt',
	'justFinishedAt',
	'auditSource',
	'auditSeverity',
	'verificationEvidence',
	'affectedFiles',
];

function resolveAiddScript(): string {
	if (process.env['AIDD_SCRIPT']) {
		return path.resolve(process.env['AIDD_SCRIPT']);
	}
	if (process.env['AIDD_ROOT']) {
		return path.join(path.resolve(process.env['AIDD_ROOT']), 'cli', 'src', 'index.ts');
	}
	return path.join(AIDD_ROOT, 'cli', 'src', 'index.ts');
}

export const AIDD_SCRIPT = resolveAiddScript();
