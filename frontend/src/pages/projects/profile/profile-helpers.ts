import { isLowExposureLocalProfile, requiresFullHardening } from 'aidd-shared/contracts';

import type { ProjectAssuranceProfile, ProjectAssuranceProfileInput } from '../../../api/types.ts';

import {
	bucketLabels,
	criticalityLabels,
	dataSensitivityLabels,
	deploymentLabels,
	externalIntegrationLabels,
} from '../projects-list-shared.ts';

/**
 * Posture carries no tone. It is a configuration reading, not a health reading: "Full hardening" is
 * the correct answer for a regulated project, and painting it red said a third of the Profile Matrix
 * was in trouble when nothing was wrong. The three labels are already distinct words, so the
 * distinction survives going neutral.
 */
export interface ProfilePosture {
	description: string;
	fullHardening: boolean;
	label: string;
	lowExposure: boolean;
	reasons: string[];
}

export function profileInput(profile: ProjectAssuranceProfile): ProjectAssuranceProfileInput {
	const input: ProjectAssuranceProfileInput = {
		authMode: profile.authMode,
		bucket: profile.bucket,
		criticality: profile.criticality,
		dataSensitivity: profile.dataSensitivity,
		deployment: profile.deployment,
		externalIntegrations: profile.externalIntegrations,
	};
	if (profile.notes) input.notes = profile.notes;
	return input;
}

export function sameProfileInput(
	a: ProjectAssuranceProfileInput,
	b: ProjectAssuranceProfileInput,
): boolean {
	return (
		a.authMode === b.authMode &&
		a.bucket === b.bucket &&
		a.criticality === b.criticality &&
		a.dataSensitivity === b.dataSensitivity &&
		a.deployment === b.deployment &&
		a.externalIntegrations === b.externalIntegrations &&
		(a.notes ?? '') === (b.notes ?? '')
	);
}

function asProfile(form: ProjectAssuranceProfileInput): ProjectAssuranceProfile {
	return { ...form, source: 'explicit', updatedAt: '' };
}

function hardeningReasons(form: ProjectAssuranceProfileInput): string[] {
	const reasons: string[] = [];
	if (form.bucket === 'public_multi_tenant' || form.bucket === 'critical_regulated') {
		reasons.push(`Bucket is ${bucketLabels[form.bucket]}`);
	}
	if (form.dataSensitivity === 'regulated') {
		reasons.push(`Data is ${dataSensitivityLabels.regulated}`);
	}
	if (form.deployment === 'public_server' || form.deployment === 'cloud') {
		reasons.push(`Deployment is ${deploymentLabels[form.deployment]}`);
	}
	if (form.externalIntegrations === 'financial_or_security') {
		reasons.push(`Integrations are ${externalIntegrationLabels.financial_or_security}`);
	}
	if (form.criticality === 'business_critical') {
		reasons.push(`Criticality is ${criticalityLabels.business_critical}`);
	}
	return reasons;
}

export function getProfilePosture(form: ProjectAssuranceProfileInput): ProfilePosture {
	const profile = asProfile(form);
	const fullHardening = requiresFullHardening(profile);
	const lowExposure = isLowExposureLocalProfile(profile);
	if (fullHardening) {
		return {
			description:
				'Audit hardening stays fully applicable; the director escalates audit backlog to HIGH.',
			fullHardening,
			label: 'Full hardening',
			lowExposure,
			reasons: hardeningReasons(form),
		};
	}
	if (lowExposure) {
		return {
			description:
				'A small local tool: non-critical audit findings are downgraded and low-only backlog is suppressed.',
			fullHardening,
			label: 'Low-exposure local',
			lowExposure,
			reasons: [],
		};
	}
	return {
		description: 'Standard exposure: audit backlog priority is left at its natural severity.',
		fullHardening,
		label: 'Standard',
		lowExposure,
		reasons: [],
	};
}
