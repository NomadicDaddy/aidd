import type { ProjectSummaryDto } from '../../types.ts';
import type { DirectorProjectPrioritySummary } from '../directorPriority.ts';
import type { ProjectFingerprintOptions } from './metadataFingerprint.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { computeProjectFingerprint } from './metadataFingerprint.ts';

export { computeProjectFingerprint } from './metadataFingerprint.ts';

interface CacheEntry {
	fingerprint: string;
	listing: ProjectListingCacheValue;
}

interface PendingEntry {
	fingerprint: string;
	promise: Promise<ProjectListingCacheValue>;
	token: object;
}

interface FingerprintMemo {
	expiresAt: number;
	value: string;
}

// computeProjectFingerprint stats on the order of a hundred files/dirs per project —
// bounded per directory, but scaling with feature count — and runs on every
// getOrCompute call (even cache hits). A short memo collapses the fingerprint I/O for
// rapid bursts — concurrent /projects + /director/fleet, plus active-run polls — to
// a single stat sweep. Tradeoff: a filesystem change is observed within at most this
// window rather than on the very next request. Explicit invalidation (invalidate /
// retainOnly) clears the memo, so DB-driven changes stay immediate.
const FINGERPRINT_TTL_MS = 2000;

export interface ProjectListingCacheValue {
	prioritySummary: DirectorProjectPrioritySummary;
	summary: ProjectSummaryDto;
}

export class ProjectListingCache {
	private entries = new Map<string, CacheEntry>();
	private pending = new Map<string, PendingEntry>();
	private fingerprintMemo = new Map<string, FingerprintMemo>();

	private async fingerprintFor(
		projectDir: string,
		options: ProjectFingerprintOptions,
	): Promise<string> {
		const memo = this.fingerprintMemo.get(projectDir);
		if (memo && Date.now() < memo.expiresAt) return memo.value;
		const value = await computeProjectFingerprint(projectDir, options);
		this.fingerprintMemo.set(projectDir, { expiresAt: Date.now() + FINGERPRINT_TTL_MS, value });
		return value;
	}

	async getOrCompute(
		projectDir: string,
		compute: () => Promise<ProjectListingCacheValue>,
		fingerprintOptions: ProjectFingerprintOptions = {},
	): Promise<ProjectListingCacheValue> {
		const fingerprint = await this.fingerprintFor(projectDir, fingerprintOptions);
		const existing = this.entries.get(projectDir);
		if (existing && existing.fingerprint === fingerprint) {
			recordDataMovement({
				category: 'metadata',
				operation: 'projects.cache',
				status: 'hit',
				target: projectDir,
			});
			return existing.listing;
		}
		// Stale-while-revalidate: a project we have seen before but whose fingerprint
		// moved (a commit, a feature.json edit) serves its last-known listing instantly
		// and recomputes in the background. The page never blocks on a re-scan after the
		// first cold load — at most one navigation observes slightly stale data, which the
		// next request (or a WebSocket invalidation) corrects. Only the cold path, with no
		// prior entry to serve, must await a fresh compute.
		if (existing) {
			recordDataMovement({
				category: 'metadata',
				operation: 'projects.cache',
				status: 'stale',
				target: projectDir,
			});
			void this.runCompute(projectDir, fingerprint, compute).catch(() => {
				// Keep serving the stale entry; a later request retries the refresh.
			});
			return existing.listing;
		}
		const pending = this.pending.get(projectDir);
		if (pending && pending.fingerprint === fingerprint) {
			recordDataMovement({
				category: 'metadata',
				operation: 'projects.cache',
				status: 'pending',
				target: projectDir,
			});
			return await pending.promise;
		}
		recordDataMovement({
			category: 'metadata',
			operation: 'projects.cache',
			status: 'miss',
			target: projectDir,
		});
		return await this.runCompute(projectDir, fingerprint, compute);
	}

	// Compute (or join an in-flight compute for the same fingerprint), populating the
	// cache entry on success. The returned promise still rejects so cold callers see
	// the error; background refreshers attach their own .catch and keep the stale entry.
	private runCompute(
		projectDir: string,
		fingerprint: string,
		compute: () => Promise<ProjectListingCacheValue>,
	): Promise<ProjectListingCacheValue> {
		const existing = this.pending.get(projectDir);
		if (existing && existing.fingerprint === fingerprint) {
			return existing.promise;
		}
		const token = {};
		const promise = (async () => {
			const listing = await compute();
			const current = this.pending.get(projectDir);
			if (current?.token === token) {
				this.entries.set(projectDir, { fingerprint, listing });
			}
			return listing;
		})();
		this.pending.set(projectDir, { fingerprint, promise, token });
		void promise
			.catch(() => {
				// Swallow here so an unawaited background refresh never raises an
				// unhandledRejection; cold callers still await `promise` directly.
			})
			.finally(() => {
				const current = this.pending.get(projectDir);
				if (current?.token === token) {
					this.pending.delete(projectDir);
				}
			});
		return promise;
	}

	invalidate(projectDir: string): void {
		this.entries.delete(projectDir);
		this.pending.delete(projectDir);
		this.fingerprintMemo.delete(projectDir);
	}

	retainOnly(projectDirs: Iterable<string>): void {
		const keep = new Set(projectDirs);
		for (const key of this.entries.keys()) {
			if (!keep.has(key)) this.entries.delete(key);
		}
		for (const key of this.pending.keys()) {
			if (!keep.has(key)) this.pending.delete(key);
		}
		for (const key of this.fingerprintMemo.keys()) {
			if (!keep.has(key)) this.fingerprintMemo.delete(key);
		}
	}
}
