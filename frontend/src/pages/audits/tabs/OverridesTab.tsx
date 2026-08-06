/* eslint-disable react-hooks/set-state-in-effect */
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditOverrideEffect, AuditProfileOverrides } from '../../../api/types.ts';

import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../../components/shared/FilterToolbar.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import {
	useAuditManager,
	useProjectAuditOverrides,
	useUpdateProjectAuditOverrides,
} from '../../../hooks/useAudits.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { OverridesList } from './OverridesList.tsx';

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
	const [query, setQuery] = useState('');
	const [stateFilter, setStateFilter] = useState<'all' | 'default' | 'overridden'>('all');

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

	// Fifteen overridden audits in a stack of forty-two identical selects had no way to be read on
	// their own; the row marker says which, and this says only those.
	const definitions = manager.data?.definitions ?? [];
	const lower = query.trim().toLowerCase();
	const visibleDefinitions = definitions.filter((definition) => {
		if (lower && !definition.name.toLowerCase().includes(lower)) return false;
		const overridden = (audits[definition.name] ?? 'default') !== 'default';
		if (stateFilter === 'overridden' && !overridden) return false;
		if (stateFilter === 'default' && overridden) return false;
		return true;
	});

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
			<FilterToolbar
				columns="lg:grid-cols-[2fr_1fr_1fr]"
				filtered={visibleDefinitions.length}
				hasFilters={query.trim() !== '' || stateFilter !== 'all'}
				header={
					<CardHeader
						action={
							<Button
								disabled={!projectId || !dirty || update.isPending}
								onClick={applyOverrides}
								variant="primary">
								<Save className="h-4 w-4" />
								{update.isPending ? 'Saving…' : 'Save Overrides'}
								{overriddenCount > 0 ? ` (${overriddenCount})` : ''}
							</Button>
						}
						className="mb-0"
						description="Per-project effects layered above the global mapping."
						title="Project Overrides"
					/>
				}
				noun="audits"
				onReset={() => {
					setQuery('');
					setStateFilter('all');
				}}
				total={definitions.length}>
				<FilterSearch onChange={setQuery} placeholder="Filter audits" value={query} />
				<FilterSelect
					label="State"
					onChange={(value) => setStateFilter(value as 'all' | 'default' | 'overridden')}
					options={[
						{ label: 'All states', value: 'all' },
						{ label: `Overridden (${overriddenCount})`, value: 'overridden' },
						{ label: 'Default', value: 'default' },
					]}
					value={stateFilter}
				/>
				<FilterSelect
					label="Project"
					onChange={(value) => setProjectId(value || null)}
					options={[
						{ label: 'Select a project…', value: '' },
						...(manager.data?.projects ?? []).map((project) => ({
							label: project.name,
							value: project.id,
						})),
					]}
					value={projectId ?? ''}
				/>
			</FilterToolbar>

			{projectId && (
				// `items-start`: the rules card holds a heading, two lines and a 260px textarea, and
				// as a stretched grid item it inherited the 944px height of the list beside it — most
				// of it empty, while the list it was matching showed 17 of 42 rows.
				<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
					<OverridesList
						audits={audits}
						definitions={visibleDefinitions}
						onChange={(name, value) =>
							setAudits((current) => ({ ...current, [name]: value }))
						}
					/>

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
