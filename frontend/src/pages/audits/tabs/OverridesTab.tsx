/* eslint-disable react-hooks/set-state-in-effect */
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditOverrideEffect, AuditProfileOverrides } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import {
	useAuditManager,
	useProjectAuditOverrides,
	useUpdateProjectAuditOverrides,
} from '../../../hooks/useAudits.ts';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { overrideEffects } from '../auditsUtils.ts';

export function OverridesTab() {
	const manager = useAuditManager();
	const [projectId, setProjectId] = useState<null | string>(null);
	const overrides = useProjectAuditOverrides(projectId);
	const update = useUpdateProjectAuditOverrides();
	const [audits, setAudits] = useState<Record<string, 'default' | AuditOverrideEffect>>({});
	const [rulesText, setRulesText] = useState('[]');
	const [rulesError, setRulesError] = useState<null | string>(null);

	useEffect(() => {
		if (!manager.data?.projects.length) return;
		if (projectId === null) setProjectId(manager.data.projects[0]?.id ?? null);
	}, [manager.data?.projects, projectId]);

	useEffect(() => {
		if (!overrides.data) return;
		const initial: Record<string, 'default' | AuditOverrideEffect> = {};
		for (const definition of manager.data?.definitions ?? []) {
			initial[definition.name] = overrides.data.audits[definition.name] ?? 'default';
		}
		setAudits(initial);
		setRulesText(JSON.stringify(overrides.data.rules, null, 2));
		setRulesError(null);
	}, [manager.data?.definitions, overrides.data]);

	const dirtyAudits = ((): Record<string, AuditOverrideEffect> => {
		const explicit: Record<string, AuditOverrideEffect> = {};
		for (const [name, effect] of Object.entries(audits)) {
			if (effect === 'default') continue;
			explicit[name] = effect;
		}
		return explicit;
	})();

	function applyOverrides() {
		if (!projectId) return;
		let parsedRules: AuditProfileOverrides['rules'];
		try {
			parsedRules = JSON.parse(rulesText) as AuditProfileOverrides['rules'];
		} catch (error) {
			setRulesError(error instanceof Error ? error.message : 'Invalid JSON');
			return;
		}
		setRulesError(null);
		update.mutate(
			{
				overrides: {
					audits: dirtyAudits,
					rules: parsedRules,
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				projectId,
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Could not save overrides',
					),
				onSuccess: () => toast.success('Project overrides saved'),
			},
		);
	}

	return (
		<div className="space-y-4">
			<Card className="grid gap-3 md:grid-cols-[2fr_1fr]">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Project</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => setProjectId(event.target.value || null)}
						value={projectId ?? ''}>
						<option value="">Select a project…</option>
						{(manager.data?.projects ?? []).map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
				</label>
				<div className="flex items-end justify-end">
					<Button
						disabled={!projectId || update.isPending}
						onClick={applyOverrides}
						variant="primary">
						<Save className="h-4 w-4" />
						{update.isPending ? 'Saving…' : 'Save Overrides'}
					</Button>
				</div>
			</Card>

			{projectId && (
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
					<Card className="overflow-x-auto p-0">
						<table aria-label="Audit overrides" className="w-full text-left text-sm">
							<thead className={tableHeadClass}>
								<tr>
									<th className="px-3 py-3" scope="col">
										Audit
									</th>
									<th className="px-3 py-3" scope="col">
										Override
									</th>
								</tr>
							</thead>
							<tbody>
								{(manager.data?.definitions ?? []).map((definition) => (
									<tr
										className="border-b border-border last:border-0"
										key={definition.name}>
										<td className="px-3 py-2 font-medium text-foreground">
											{definition.name}
										</td>
										<td className="px-3 py-2">
											<select
												className={`${selectClass} w-full`}
												onChange={(event) =>
													setAudits((current) => ({
														...current,
														[definition.name]: event.target.value as
															'default' | AuditOverrideEffect,
													}))
												}
												value={audits[definition.name] ?? 'default'}>
												{overrideEffects.map((option) => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</Card>

					<Card className="space-y-3">
						<div className="font-medium text-foreground">Project-scoped Rules</div>
						<p className="text-xs text-muted-foreground">
							Optional rules layered above the global mapping for this project. JSON
							array matching the global rule schema.
						</p>
						<textarea
							aria-label="Project audit rules JSON"
							className="min-h-[260px] w-full resize-y rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring"
							onChange={(event) => setRulesText(event.target.value)}
							value={rulesText}
						/>
						{rulesError && (
							<div className="text-xs text-red-700 dark:text-red-300">
								{rulesError}
							</div>
						)}
					</Card>
				</div>
			)}
		</div>
	);
}
