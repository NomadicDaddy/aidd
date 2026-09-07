import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import type { BackendName, PipelineSessionRecord } from './types.ts';
import type { SkillCategory, SkillDefinition, SkillImportPreview } from './types/skills.ts';

import { apiGet, apiSend } from './client.ts';

export interface SkillRunRequest {
	args?: string;
	backend?: BackendName;
	executionIntent: SkillExecutionIntent;
	model?: string;
	projectDir: string;
	reasoningEffort?: string;
	skillId: string;
}

export interface SkillImportRequest {
	category?: SkillCategory;
	replace?: boolean;
	sourcePath: string;
}

export async function deleteSkillImport(id: string): Promise<void> {
	await apiSend<{ deleted: true }>(`/api/v1/skills/imports/${id}`, 'DELETE');
}

export async function listSkills(): Promise<SkillDefinition[]> {
	const response = await apiGet<{ skills: SkillDefinition[] }>('/api/v1/skills');
	return response.skills;
}

export async function importSkill(input: SkillImportRequest): Promise<SkillDefinition> {
	const response = await apiSend<{ skill: SkillDefinition }>(
		'/api/v1/skills/imports',
		'POST',
		input,
	);
	return response.skill;
}

export async function previewSkillImport(input: SkillImportRequest): Promise<SkillImportPreview> {
	const response = await apiSend<{ preview: SkillImportPreview }>(
		'/api/v1/skills/imports/preview',
		'POST',
		input,
	);
	return response.preview;
}

// One-shot runs execute as a single-step pipeline session (synthetic
// `skill:<id>` recipe), so the launch result is a session, not a run.
export async function runSkill(input: SkillRunRequest): Promise<PipelineSessionRecord> {
	const response = await apiSend<{ session: PipelineSessionRecord }>(
		`/api/v1/skills/${input.skillId}/run`,
		'POST',
		{
			args: input.args,
			backend: input.backend,
			executionIntent: input.executionIntent,
			model: input.model,
			projectDir: input.projectDir,
			reasoningEffort: input.reasoningEffort,
		},
	);
	return response.session;
}
