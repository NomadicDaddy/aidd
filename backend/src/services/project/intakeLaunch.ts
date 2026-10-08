import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import type { PipelineService } from '../pipelineService.ts';

// The one way a project is taken into aidd after creation, import or a retried failure: the
// project-intake recipe as a metadata-only operator session. Three routes used to spell this
// closure out, and the third had already dropped the launch target.
export async function launchProjectIntake(
	pipelineService: Pick<PipelineService, 'launchRecipe'>,
	projectDir: string,
	launchTarget?: LaunchTargetOverrides,
): Promise<{ id: string }> {
	const session = await pipelineService.launchRecipe({
		initiator: 'operator',
		...(launchTarget === undefined ? {} : { launchTarget }),
		metadataOnly: true,
		projectDir,
		recipeId: 'project-intake',
	});
	return { id: session.id };
}
