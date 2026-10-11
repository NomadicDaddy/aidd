import { toast } from 'sonner';

import type { ProjectFeature } from '../../../api/types.ts';

import { useUpdateProjectFeatureMetadata } from '../../../hooks/useProjects.ts';
import { featureDirectory } from './featuresUtils.ts';

export function useFeaturePriorityUpdate(projectId: string) {
	const updateMetadata = useUpdateProjectFeatureMetadata(projectId);

	function onPriorityChange(feature: ProjectFeature, priority: number): void {
		updateMetadata.mutate(
			{ featureId: featureDirectory(feature), priority },
			{
				onError: (error) =>
					toast.error(
						error instanceof Error
							? error.message
							: 'Failed to update feature priority',
					),
				onSuccess: () => toast.success('Feature priority updated'),
			},
		);
	}

	return { isPending: updateMetadata.isPending, onPriorityChange };
}
