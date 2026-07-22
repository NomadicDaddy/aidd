import type { DirectorPrioritizedWork, DirectorPriorityHealth } from './types.ts';

import { sourceCount, sourcePriority } from './helpers.ts';
import { bucketRank, healthBands } from './types.ts';

export function sortPrioritizedWork(items: DirectorPrioritizedWork[]): DirectorPrioritizedWork[] {
	return [...items]
		.sort((left, right) => {
			const rankDelta = bucketRank[left.taskType] - bucketRank[right.taskType];
			if (rankDelta !== 0) return rankDelta;
			const leftPriority = sourcePriority(left.evidence);
			const rightPriority = sourcePriority(right.evidence);
			if (leftPriority !== rightPriority) return leftPriority - rightPriority;
			const leftCount = sourceCount(left.evidence);
			const rightCount = sourceCount(right.evidence);
			if (leftCount !== rightCount) return rightCount - leftCount;
			return left.projectId.localeCompare(right.projectId);
		})
		.map((item, index) => ({ ...item, rank: index + 1 }));
}

export function buildPriorityHealth(work: DirectorPrioritizedWork[]): DirectorPriorityHealth {
	const sorted = sortPrioritizedWork(work);
	const primary = sorted[0];
	if (!primary) {
		return {
			band: 'healthy',
			primaryBucket: 'healthy',
			primaryTaskType: null,
			reasons: ['No priority issues detected.'],
			score: 100,
		};
	}
	const band = healthBands[primary.taskType];
	const penalty = boundedPenalty(primary);
	return {
		band: band.band,
		primaryBucket: band.bucket,
		primaryTaskType: primary.taskType,
		reasons: sorted.map((item) => item.reason).slice(0, 5),
		score: Math.max(0, band.scoreCeiling - penalty),
	};
}

function boundedPenalty(item: DirectorPrioritizedWork): number {
	const count = sourceCount(item.evidence);
	const stale = Array.isArray(item.evidence.stale) ? item.evidence.stale.length : 0;
	const severityPenalty = item.riskLevel === 'HIGH' ? 3 : item.riskLevel === 'MEDIUM' ? 2 : 1;
	return Math.min(10, count + stale + severityPenalty);
}
