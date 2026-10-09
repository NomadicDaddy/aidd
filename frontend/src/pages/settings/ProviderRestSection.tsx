import { formatRestUntil } from 'aidd-shared/provider-rest/decide';
import { useState } from 'react';

import type { BackendName } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import {
	useClearProviderRest,
	useProviderRest,
	useSetProviderRest,
} from '../../hooks/useProviderRest.ts';
import { backendLabel, backendOptions } from '../../lib/backends.ts';
import { reportFailure } from '../../lib/failureToast.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { dangerRowActionClass, toneText } from '../../lib/tones.ts';

const restLengths: { label: string; minutes: number }[] = [
	{ label: '30 minutes', minutes: 30 },
	{ label: '1 hour', minutes: 60 },
	{ label: '2 hours', minutes: 120 },
	{ label: '4 hours', minutes: 240 },
	{ label: '8 hours', minutes: 480 },
	{ label: '24 hours', minutes: 1440 },
];

function labelList(backends: readonly string[], separator: string): string {
	return backends.map((backend) => backendLabel(backend)).join(separator);
}

/**
 * Rests a backend by hand and ends rests early. A rest is live state, not a setting, so this card
 * acts immediately rather than through the settings commit bar, and the CLI reads the same rests.
 */
export function ProviderRestSection() {
	const state = useProviderRest();
	const setRest = useSetProviderRest();
	const clearRest = useClearProviderRest();
	const [backend, setBackend] = useState<BackendName>('claude-code');
	const [minutes, setMinutes] = useState(60);
	const [reason, setReason] = useState('');
	// The fetch time, not the render time: reading the clock while rendering is impure.
	const now = new Date(state.dataUpdatedAt);

	function submitRest(): void {
		const until = new Date(Date.now() + minutes * 60_000).toISOString();
		const trimmed = reason.trim();
		setRest.mutate(
			{ backend, input: trimmed.length > 0 ? { reason: trimmed, until } : { until } },
			{
				onError: reportFailure('Resting ' + backendLabel(backend)),
				onSuccess: () => setReason(''),
			},
		);
	}

	return (
		<Card className="flex flex-col gap-4" variant="sunken">
			<CardHeader
				className="mb-0"
				description="A resting backend starts no new runs until its rest ends. Launches that use a default, a schedule, a recipe or the Director move to the next substitute and record it; a launch where you pick the resting backend asks you first. Runs already going are never switched."
				title="Provider Rest"
			/>
			{state.isError ? (
				<p className={`text-xs ${toneText.red}`} role="alert">
					Could not load provider rest.
				</p>
			) : state.data ? (
				<>
					<p className="text-xs text-muted-foreground">
						Substitution order: {labelList(state.data.substitutes, ', then ')}. Rests on
						its own after a rate limit reports its reset:{' '}
						{labelList(state.data.autoRestBackends, ', ')}.
					</p>
					{state.data.rests.length === 0 ? (
						<p className="text-sm text-muted-foreground">No backend is resting.</p>
					) : (
						<ul className="divide-y divide-border rounded-md border border-border">
							{state.data.rests.map((rest) => (
								<li
									className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
									key={rest.backend}>
									<span className="text-sm">
										<span className="font-medium">
											{backendLabel(rest.backend)}
										</span>{' '}
										resting until {formatRestUntil(rest.until, now)}
										{rest.reason.length > 0 ? ` (${rest.reason})` : ''}
										<span className="text-xs text-muted-foreground">
											{' · '}
											{rest.source === 'rate_limit'
												? 'rate limit'
												: 'set by hand'}
										</span>
									</span>
									<Button
										className={dangerRowActionClass}
										disabled={clearRest.isPending}
										onClick={() =>
											clearRest.mutate(rest.backend, {
												onError: reportFailure('Ending the rest'),
											})
										}
										size="compact"
										variant="ghost">
										End rest
									</Button>
								</li>
							))}
						</ul>
					)}
				</>
			) : (
				<p aria-live="polite" className="text-xs text-muted-foreground" role="status">
					Loading provider rest…
				</p>
			)}
			<div className="flex flex-wrap items-end gap-3">
				<FieldRow label="Backend">
					<select
						className={selectClass}
						onChange={(event) => {
							const next = backendOptions.find(
								(option) => option.value === event.target.value,
							);
							if (next) setBackend(next.value);
						}}
						value={backend}>
						{backendOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</FieldRow>
				<FieldRow label="Rest for">
					<select
						className={selectClass}
						onChange={(event) => setMinutes(Number(event.target.value))}
						value={minutes}>
						{restLengths.map((length) => (
							<option key={length.minutes} value={length.minutes}>
								{length.label}
							</option>
						))}
					</select>
				</FieldRow>
				<FieldRow className="min-w-48 flex-1" label="Reason (optional)">
					<Input
						maxLength={200}
						onChange={(event) => setReason(event.target.value)}
						value={reason}
					/>
				</FieldRow>
				<Button disabled={setRest.isPending} onClick={submitRest}>
					Rest {backendLabel(backend)}
				</Button>
			</div>
		</Card>
	);
}
