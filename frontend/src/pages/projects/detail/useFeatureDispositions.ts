import { isDismissableFinding } from 'aidd-shared/contracts/finding-dispositions';
import { useState } from 'react';
import { toast } from 'sonner';

import type { FindingDismissalInput, ProjectFeature } from '../../../api/types.ts';

import { useDeleteProjectFeature, useDismissProjectFeature } from '../../../hooks/useProjects.ts';
import { featureDirectory } from './featuresUtils.ts';

export function useFeatureDispositions(projectId: string) {
	const [pendingDelete, setPendingDelete] = useState<null | ProjectFeature>(null);
	const [pendingDismissal, setPendingDismissal] = useState<null | ProjectFeature>(null);
	const deleteFeature = useDeleteProjectFeature(projectId);
	const dismissFeature = useDismissProjectFeature(projectId);

	function onDelete(feature: ProjectFeature): void {
		if (isDismissableFinding(feature)) {
			setPendingDismissal(feature);
			return;
		}
		setPendingDelete(feature);
	}

	function confirmDismissal(input: FindingDismissalInput): void {
		if (!pendingDismissal) return;
		dismissFeature.mutate(
			{ featureId: featureDirectory(pendingDismissal), input },
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Failed to dismiss finding',
					),
				onSuccess: () => {
					setPendingDismissal(null);
					toast.success('Finding dismissed');
				},
			},
		);
	}

	function confirmDelete(): void {
		if (!pendingDelete) return;
		deleteFeature.mutate(featureDirectory(pendingDelete), {
			onError: (error) =>
				toast.error(error instanceof Error ? error.message : 'Failed to delete feature'),
			onSettled: () => setPendingDelete(null),
			onSuccess: () => toast.success('Feature deleted'),
		});
	}

	return {
		confirmDelete,
		confirmDismissal,
		deleteFeature,
		dismissFeature,
		onDelete,
		pendingDelete,
		pendingDismissal,
		setPendingDelete,
		setPendingDismissal,
	};
}
