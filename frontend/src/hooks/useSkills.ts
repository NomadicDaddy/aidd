import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
	deleteSkillImport,
	importSkill,
	listSkills,
	previewSkillImport,
	runSkill,
	type SkillImportRequest,
	type SkillRunRequest,
} from '../api/skills.ts';

export function useSkills() {
	const queryClient = useQueryClient();
	return {
		runSkill: useMutation({
			mutationFn: (input: SkillRunRequest) => runSkill(input),
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
				void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
			},
		}),
		skills: useQuery({ queryFn: listSkills, queryKey: ['skills'] }),
	};
}

export function useSkillImports() {
	const queryClient = useQueryClient();
	return {
		deleteImport: useMutation({
			mutationFn: deleteSkillImport,
			onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
		}),
		importSkill: useMutation({
			mutationFn: (input: SkillImportRequest) => importSkill(input),
			onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
		}),
		previewImport: useMutation({
			mutationFn: (input: SkillImportRequest) => previewSkillImport(input),
		}),
	};
}
