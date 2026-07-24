import type { BackendInputName, TriumvirateSettings } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { backendOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { nullableText, textValue } from './settingsUtils.ts';

export function TriumvirateSection({
	setTriumvirateField,
	triumvirate,
}: {
	setTriumvirateField: <K extends keyof TriumvirateSettings>(
		key: K,
		value: TriumvirateSettings[K]
	) => void;
	triumvirate: null | TriumvirateSettings | undefined;
}) {
	return (
		<Card className="space-y-3 p-3">
			<div>
				<h2 className="text-foreground text-sm font-semibold">Triumvirate Roles</h2>
				<p className="mt-0.5 text-xs text-neutral-500">
					Override the secondary, overseer, and execution roles used by Triumvirate runs.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Secondary CLI
					</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setTriumvirateField(
								'secondaryCli',
								event.target.value ? (event.target.value as BackendInputName) : null
							)
						}
						value={triumvirate?.secondaryCli ?? ''}>
						<option value="">Use launch selection</option>
						{backendOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Secondary Model
					</span>
					<Input
						onChange={(event) =>
							setTriumvirateField('secondaryModel', nullableText(event.target.value))
						}
						value={textValue(triumvirate?.secondaryModel ?? null)}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Overseer CLI
					</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setTriumvirateField(
								'overseerCli',
								event.target.value ? (event.target.value as BackendInputName) : null
							)
						}
						value={triumvirate?.overseerCli ?? ''}>
						<option value="">Use launch selection</option>
						{backendOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Overseer Model
					</span>
					<Input
						onChange={(event) =>
							setTriumvirateField('overseerModel', nullableText(event.target.value))
						}
						value={textValue(triumvirate?.overseerModel ?? null)}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Execution CLI
					</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setTriumvirateField(
								'execCli',
								event.target.value ? (event.target.value as BackendInputName) : null
							)
						}
						value={triumvirate?.execCli ?? ''}>
						<option value="">Use launch selection</option>
						{backendOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Execution Model
					</span>
					<Input
						onChange={(event) =>
							setTriumvirateField('execModel', nullableText(event.target.value))
						}
						value={textValue(triumvirate?.execModel ?? null)}
					/>
				</label>
			</div>
		</Card>
	);
}
