import type { AuditDefinition, AuditEffect, AuditOverrideEffect } from '../../../api/types.ts';
import type { FilterRegister } from '../../../lib/filterFields.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useViewportFill } from '../../../hooks/useViewportFill.ts';
import { selectClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { toneBorder } from '../../../lib/tones.ts';
import { microLabelClass } from '../../../lib/typography.ts';
import { overrideEffects } from '../auditsUtils.ts';

type EffectValue = 'default' | AuditOverrideEffect;

interface OverridesListProps {
	audits: Record<string, EffectValue>;
	definitions: AuditDefinition[];
	dirty: boolean;
	/** The filters that narrowed the list to nothing, when any are in force. */
	filters?: FilterRegister | undefined;
	inheritedEffects: Record<string, AuditEffect>;
	onChange: (name: string, value: EffectValue) => void;
	persistedAudits: Record<string, AuditOverrideEffect>;
}

function OverridesTable({
	ariaLabel,
	audits,
	definitions,
	headOffsetClass,
	inheritedEffects,
	onChange,
	persistedAudits,
}: { ariaLabel: string; headOffsetClass: string } & Omit<OverridesListProps, 'dirty' | 'filters'>) {
	const tableId = ariaLabel.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase();

	return (
		<table aria-label={ariaLabel} className="w-full text-left text-sm">
			<thead className={`${tableHeadClass} sticky z-10 ${headOffsetClass}`}>
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
					const persistedValue = persistedAudits[definition.name] ?? 'default';
					const dirty = value !== persistedValue;
					const overridden = value !== 'default';
					const inheritedValue = inheritedEffects[definition.name] ?? 'default';
					const inheritedLabel =
						overrideEffects.find((option) => option.value === inheritedValue)?.label ??
						inheritedValue;
					const inheritedId = `${tableId}-inherited-${definition.name}`;
					const markerClass = dirty
						? `${toneBorder.amber} border-dashed font-semibold`
						: overridden
							? 'border-accent/60 border-solid font-semibold'
							: 'border-transparent border-solid font-medium';
					return (
						<tr
							className="group/quiet border-b border-border last:border-0"
							key={definition.name}>
							<td
								className={`border-l-2 px-3 py-2 font-mono wrap-anywhere text-foreground ${markerClass}`}>
								{definition.name}
							</td>
							<td className="px-3 py-2">
								<div className="flex flex-wrap items-center justify-end gap-2">
									<span
										className={`text-muted-foreground ${microLabelClass}`}
										id={inheritedId}>
										Inherited: {inheritedLabel}
									</span>
									{dirty ? (
										<Badge casing="preserve" tone="amber">
											Pending
										</Badge>
									) : null}
									<select
										aria-describedby={inheritedId}
										aria-label={`Override for ${definition.name}`}
										className={`${selectClass} ml-auto`}
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
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

/**
 * The per-audit override list.
 *
 * Fifteen of forty-two rows carried an override and the only thing that said so was a
 * `bg-accent-muted/40` row background — a 6% tint, imperceptible in dark mode, and a hue in any
 * case. The marker is a 2px rule in the row's own gutter and a heavier audit name: both are shape,
 * so neither depends on telling two colours apart. Every row reserves the 2px, so nothing shifts.
 */
export function OverridesList({
	audits,
	definitions,
	dirty,
	filters,
	inheritedEffects,
	onChange,
	persistedAudits,
}: OverridesListProps) {
	const listRef = useViewportFill<HTMLDivElement>({
		gutterPx: dirty ? 72 : 24,
		refreshKey: `${definitions.length}:${dirty}`,
	});
	// Ahead of the Card rather than inside it. An empty two-column grid put a bare table row in
	// the left half of a full-width box with the right half blank beside it, and the row could not
	// say which filters produced it.
	if (definitions.length === 0) {
		return (
			<EmptyState filterReset="toolbar" filters={filters}>
				No audits match those filters.
			</EmptyState>
		);
	}
	const splitIndex = Math.ceil(definitions.length / 2);
	const columns = [
		{
			ariaLabel: 'Audit overrides, first column',
			definitions: definitions.slice(0, splitIndex),
		},
		{
			ariaLabel: 'Audit overrides, second column',
			definitions: definitions.slice(splitIndex),
		},
	];
	return (
		<Card className="min-w-0 p-0">
			{/* Narrow, this table is not a scrollport and must not be wrapped in one. Measured at
			    390x844 and 360x800: the wrapper's scrollWidth equalled its clientWidth on both, 356
			    and 326, so nothing was ever hidden past either edge. What the wrapper did do is make
			    itself the scroll container the head's `sticky` resolves against, and narrow it carries
			    no height cap — so its scrollport was its own 3695px of content and the head could not
			    pin against it. It left the screen one viewport in and stayed gone for the remaining
			    ~2900px, leaving forty-two selects to be read without the two labels that name the
			    columns. Outside the wrapper the same `sticky` resolves against the document, offset by
			    the phone top bar, which measures 129px. */}
			<div className="xl:hidden">
				<OverridesTable
					ariaLabel="Audit overrides"
					audits={audits}
					definitions={definitions}
					headOffsetClass="top-[var(--app-topbar-height,0px)]"
					inheritedEffects={inheritedEffects}
					onChange={onChange}
					persistedAudits={persistedAudits}
				/>
			</div>
			{/* The scrollport belongs to the xl branch alone: there it is capped to the measured
			    viewport remainder, so it genuinely scrolls and its head pins against that cap. */}
			<OverflowScroller
				ariaLabel="Project audit overrides"
				className="hidden xl:block"
				rootRef={listRef}
				scrollerClassName="xl:max-h-[var(--fill-height)] xl:overflow-y-auto">
				<div className="relative grid grid-cols-2 items-start">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-border"
					/>
					{columns.map((column) => (
						<OverridesTable
							ariaLabel={column.ariaLabel}
							audits={audits}
							definitions={column.definitions}
							headOffsetClass="top-0"
							inheritedEffects={inheritedEffects}
							key={column.ariaLabel}
							onChange={onChange}
							persistedAudits={persistedAudits}
						/>
					))}
				</div>
			</OverflowScroller>
		</Card>
	);
}
