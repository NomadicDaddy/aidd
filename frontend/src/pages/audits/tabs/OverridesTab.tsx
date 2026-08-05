/* eslint-disable react-hooks/set-state-in-effect */
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditOverrideEffect, AuditProfileOverrides } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import {
	useAuditManager,
	useProjectAuditOverrides,
	useUpdateProjectAuditOverrides,
} from '../../../hooks/useAudits.ts';
import { fieldLabelClass, selectClass, textareaClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { overrideEffects } from '../auditsUtils.ts';

function sameEffects(
	left: Record<string, AuditOverrideEffect>,
	right: Record<string, AuditOverrideEffect>,
): boolean {
	const names = new Set([...Object.keys(left), ...Object.keys(right)]);
	for (const name of names) {
		if (left[name] !== right[name]) return false;
	}
	return true;
}

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

	const explicitAudits = ((): Record<string, AuditOverrideEffect> => {
		const explicit: Record<string, AuditOverrideEffect> = {};
		for (const [name, effect] of Object.entries(audits)) {
			if (effect === 'default') continue;
			explicit[name] = effect;
		}
		return explicit;
	})();

	// Save was gated only on `projectId`, so it sat fully saturated on load while the Catalog tab's
	// Save — the other Save on the same page — was greyed out in the same untouched state.
	const dirty =
		overrides.data !== undefined &&
		(!sameEffects(explicitAudits, overrides.data.audits) ||
			rulesText !== JSON.stringify(overrides.data.rules, null, 2));
	const overriddenCount = Object.keys(explicitAudits).length;

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
					audits: explicitAudits,
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
			{/* `auto` on the action column: at 768 a fractional column squeezed the button until its
			    label wrapped inside it. */}
			<Card className="grid gap-3 md:grid-cols-[minmax(0,2fr)_auto]">
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
						disabled={!projectId || !dirty || update.isPending}
						onClick={applyOverrides}
						variant="primary">
						<Save className="h-4 w-4" />
						{update.isPending ? 'Saving…' : 'Save Overrides'}
						{overriddenCount > 0 ? ` (${overriddenCount})` : ''}
					</Button>
				</div>
			</Card>

			{projectId && (
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
					<Card className="max-h-[calc(100dvh-16rem)] overflow-auto p-0">
						<table aria-label="Audit overrides" className="w-full text-left text-sm">
							<thead className={`${tableHeadClass} sticky top-0 z-10`}>
								<tr>
									<th className="bg-muted px-3 py-3" scope="col">
										Audit
									</th>
									<th className="bg-muted px-3 py-3 text-right" scope="col">
										Override
									</th>
								</tr>
							</thead>
							<tbody>
								{(manager.data?.definitions ?? []).map((definition) => {
									const value = audits[definition.name] ?? 'default';
									return (
										// A tinted row is what makes the handful of overridden audits
										// scannable in a stack of ~40 identical controls.
										<tr
											className={`border-b border-border last:border-0 ${value === 'default' ? '' : 'bg-accent-muted/40'}`}
											key={definition.name}>
											<td className="px-3 py-2 font-medium text-foreground">
												{definition.name}
											</td>
											<td className="px-3 py-2 text-right">
												<select
													aria-label={`Override for ${definition.name}`}
													className={`${selectClass} ml-auto w-36`}
													onChange={(event) =>
														setAudits((current) => ({
															...current,
															[definition.name]: event.target
																.value as
																'default' | AuditOverrideEffect,
														}))
													}
													value={value}>
													{overrideEffects.map((option) => (
														<option
															key={option.value}
															value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</Card>

					<Card className="space-y-3">
						<CardHeader
							className="mb-0"
							description="Optional rules layered above the global mapping for this project. JSON array matching the global rule schema."
							title="Project-scoped Rules"
						/>
						<textarea
							aria-label="Project audit rules JSON"
							className={`${textareaClass} min-h-[260px] font-mono text-xs`}
							onChange={(event) => setRulesText(event.target.value)}
							value={rulesText}
						/>
						{rulesError && (
							<div className={`text-xs ${toneText.red}`}>{rulesError}</div>
						)}
					</Card>
				</div>
			)}
		</div>
	);
}
