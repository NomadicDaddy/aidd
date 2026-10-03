import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
	deleteSkillImport,
	getSkill,
	importSkill,
	listSkills,
	previewSkillImport,
	runSkill,
	type SkillImportRequest,
	type SkillRunRequest,
} from '../api/skills.ts';

export function useSkillCatalog() {
	return useQuery({ queryFn: listSkills, queryKey: ['skills'] });
}

/**
 * One skill's full definition, for the detail pane. The catalog list carries every skill's
 * metadata but, after the list is slimmed, no SKILL.md bodies: those were 93% of a 727 KB response
 * that the Telemetry page and the schedule form downloaded only to read ids and titles.
 */
export function useSkill(id: string) {
	return useQuery({
		queryFn: ({ signal }) => getSkill(id, signal),
		queryKey: ['skills', 'detail', id],
	});
}

export function useSkills() {
	const queryClient = useQueryClient();
	const skills = useSkillCatalog();
	return {
		runSkill: useMutation({
			mutationFn: (input: SkillRunRequest) => runSkill(input),
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
				void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
			},
		}),
		skills,
	};
}

export function useSkillImports() {
	const queryClient = useQueryClient();
	// The sidebar count comes from its own endpoint, so it needs the same refresh the catalog gets.
	const refreshSkills = () => {
		void queryClient.invalidateQueries({ queryKey: ['skills'] });
		void queryClient.invalidateQueries({ queryKey: ['nav-counts'] });
	};
	return {
		deleteImport: useMutation({ mutationFn: deleteSkillImport, onSuccess: refreshSkills }),
		importSkill: useMutation({
			mutationFn: (input: SkillImportRequest) => importSkill(input),
			onSuccess: refreshSkills,
		}),
		previewImport: useMutation({
			mutationFn: (input: SkillImportRequest) => previewSkillImport(input),
		}),
	};
}
