import { toast } from 'sonner';

import type { ProjectFeature } from '../../../api/types.ts';

import { useUpdateProjectFeatureMetadata } from '../../../hooks/useProjects.ts';
import { featureDirectory } from './featuresUtils.ts';

export function useFeatureCategoryUpdate(projectId: string) {
	const updateMetadata = useUpdateProjectFeatureMetadata(projectId);

	function onSourceChange(feature: ProjectFeature, category: string): void {
		updateMetadata.mutate(
			{
				category: category || null,
				featureId: featureDirectory(feature),
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Failed to update feature source',
					),
				onSuccess: () => toast.success('Feature source updated'),
			},
		);
	}

	return { isPending: updateMetadata.isPending, onSourceChange };
}
