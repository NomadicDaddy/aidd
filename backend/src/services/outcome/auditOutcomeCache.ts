import { METADATA_DIR } from 'aidd-shared/metadata/paths';
import { readFindingEvents } from 'aidd-shared/metadata/store/runHistory';
import {
	aggregateFindingOutcomes,
	type FindingLifecycleMeasures,
} from 'aidd-shared/outcome-measures';
import { join } from 'node:path';

import { computeProjectFingerprint } from '../project/metadataFingerprint.ts';

export interface ProjectLedgerOutcomes {
	byAudit: Map<string, FindingLifecycleMeasures>;
	/** True when the ledger exists but could not be read; byAudit is then empty. */
	degraded: boolean;
}

interface CacheEntry {
	fingerprint: string;
	outcomes: ProjectLedgerOutcomes;
}

async function readProjectLedgerOutcomes(projectPath: string): Promise<ProjectLedgerOutcomes> {
	try {
		const ledger = await readFindingEvents(join(projectPath, METADATA_DIR));
		return { byAudit: aggregateFindingOutcomes(ledger.events).byAudit, degraded: false };
	} catch {
		// readFindingEvents already maps a missing ledger to an empty one; anything that still
		// throws (a directory in the file's place, a permission error) hides real findings.
		return { byAudit: new Map(), degraded: true };
	}
}

/**
 * Per-project findings-ledger aggregation, memoized on the project metadata fingerprint so the
 * Audits page re-reads a ledger only after something under the project's `.aidd` changed.
 */
export class AuditOutcomeCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly fingerprint: (projectPath: string) => Promise<string>;

	constructor(
		fingerprint: (projectPath: string) => Promise<string> = (projectPath) =>
			computeProjectFingerprint(projectPath, {}),
	) {
		this.fingerprint = fingerprint;
	}

	async get(projectPath: string): Promise<ProjectLedgerOutcomes> {
		const fingerprint = await this.fingerprint(projectPath);
		const cached = this.entries.get(projectPath);
		if (cached && cached.fingerprint === fingerprint) return cached.outcomes;
		const outcomes = await readProjectLedgerOutcomes(projectPath);
		// A degraded read is not cached: the next request should try the ledger again.
		if (outcomes.degraded) this.entries.delete(projectPath);
		else this.entries.set(projectPath, { fingerprint, outcomes });
		return outcomes;
	}
}

export const defaultAuditOutcomeCache = new AuditOutcomeCache();
