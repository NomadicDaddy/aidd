import type { BackendInputName, TriumvirateSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
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
		value: TriumvirateSettings[K],
	) => void;
	triumvirate: null | TriumvirateSettings | undefined;
}) {
	return (
		<Card
			aria-labelledby="settings-triumvirate-heading"
			className="flex flex-col gap-3"
			role="region">
			<CardHeader
				className="mb-0"
				description="Override the secondary, overseer, and execution roles used by Triumvirate runs."
				id="settings-triumvirate-heading"
				title="Triumvirate Roles"
			/>
			<FormGrid className="@min-[45rem]:grid-cols-2">
				<FieldRow label="Secondary CLI">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setTriumvirateField(
								'secondaryCli',
								event.target.value
									? (event.target.value as BackendInputName)
									: null,
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
				</FieldRow>
				<FieldRow label="Secondary Model">
					<Input
						className="font-mono"
						onChange={(event) =>
							setTriumvirateField('secondaryModel', nullableText(event.target.value))
						}
						value={textValue(triumvirate?.secondaryModel ?? null)}
					/>
				</FieldRow>
				<FieldRow label="Overseer CLI">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setTriumvirateField(
								'overseerCli',
								event.target.value
									? (event.target.value as BackendInputName)
									: null,
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
				</FieldRow>
				<FieldRow label="Overseer Model">
					<Input
						className="font-mono"
						onChange={(event) =>
							setTriumvirateField('overseerModel', nullableText(event.target.value))
						}
						value={textValue(triumvirate?.overseerModel ?? null)}
					/>
				</FieldRow>
				<FieldRow label="Execution CLI">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setTriumvirateField(
								'execCli',
								event.target.value
									? (event.target.value as BackendInputName)
									: null,
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
				</FieldRow>
				<FieldRow label="Execution Model">
					<Input
						className="font-mono"
						onChange={(event) =>
							setTriumvirateField('execModel', nullableText(event.target.value))
						}
						value={textValue(triumvirate?.execModel ?? null)}
					/>
				</FieldRow>
			</FormGrid>
		</Card>
	);
}
