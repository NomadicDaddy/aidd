import type { AuditDefinition, AuditOverrideEffect } from '../../../api/types.ts';

import { Card } from '../../../components/ui/card.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { overrideEffects } from '../auditsUtils.ts';

type EffectValue = 'default' | AuditOverrideEffect;

interface OverridesListProps {
	audits: Record<string, EffectValue>;
	definitions: AuditDefinition[];
	onChange: (name: string, value: EffectValue) => void;
}

/**
 * The per-audit override list.
 *
 * Fifteen of forty-two rows carried an override and the only thing that said so was a
 * `bg-accent-muted/40` row background — a 6% tint, imperceptible in dark mode, and a hue in any
 * case. The marker is a 2px rule in the row's own gutter and a heavier audit name: both are shape,
 * so neither depends on telling two colours apart. Every row reserves the 2px, so nothing shifts.
 */
export function OverridesList({ audits, definitions, onChange }: OverridesListProps) {
	return (
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
					{definitions.map((definition) => {
						const value = audits[definition.name] ?? 'default';
						const overridden = value !== 'default';
						return (
							<tr
								className="border-b border-border last:border-0"
								key={definition.name}>
								<td
									className={`border-l-2 px-3 py-2 text-foreground ${
										overridden
											? 'border-accent font-semibold'
											: 'border-transparent font-medium'
									}`}>
									{definition.name}
								</td>
								<td className="px-3 py-2 text-right">
									<select
										aria-label={`Override for ${definition.name}`}
										className={`${selectClass} ml-auto w-36`}
										onChange={(event) =>
											onChange(
												definition.name,
												event.target.value as EffectValue,
											)
										}
										value={value}>
										{overrideEffects.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</td>
							</tr>
						);
					})}
					{definitions.length === 0 && (
						<tr>
							<td className="px-3 py-6 text-sm text-muted-foreground" colSpan={2}>
								No audits match those filters.
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</Card>
	);
}
