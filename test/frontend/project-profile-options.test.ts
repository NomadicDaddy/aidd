import { describe, expect, test } from 'bun:test';
import {
	projectAssuranceBuckets,
	projectAuthModeValues,
	projectCriticalityValues,
	projectDataSensitivityValues,
	projectDeploymentValues,
	projectExternalIntegrationValues,
} from '../../shared/src/contracts/project-profile.ts';
import {
	authModeOptions,
	bucketOptions,
	criticalityOptions,
	dataSensitivityOptions,
	deploymentOptions,
	externalIntegrationOptions,
} from '../../frontend/src/pages/projects/projects-list-shared.ts';

describe('project profile frontend options', () => {
	test('match the shared project profile contract', () => {
		expect(bucketOptions).toEqual([...projectAssuranceBuckets]);
		expect(dataSensitivityOptions).toEqual([...projectDataSensitivityValues]);
		expect(deploymentOptions).toEqual([...projectDeploymentValues]);
		expect(authModeOptions).toEqual([...projectAuthModeValues]);
		expect(criticalityOptions).toEqual([...projectCriticalityValues]);
		expect(externalIntegrationOptions).toEqual([...projectExternalIntegrationValues]);
	});
});
