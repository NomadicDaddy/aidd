import type { AuditDefinition, AuditOverrideEffect } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { overrideEffects } from '../auditsUtils.ts';

type EffectValue = 'default' | AuditOverrideEffect;

interface OverridesListProps {
	audits: Record<string, EffectValue>;
	definitions: AuditDefinition[];
	onChange: (name: string, value: EffectValue) => void;
	scrollerClassName: string;
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
	onChange,
	scrollerClassName,
}: OverridesListProps) {
	return (
		// Two columns, so this one never needs a card stack — it fits the narrowest content column
		// there is. What it did need is the scrollport: `overflow-auto` on the Card scrolled forty-two
		// rows with no way to reach them but a pointer, and being `overflow-auto` rather than
		// `overflow-x-auto` it slipped past the affordance guard that would have caught it.
		//
		// `min-w-0` is what makes that scrollport actually scroll. A grid item's automatic minimum
		// size is its min-content size, so this card sized to the widest thing in the table — 384px
		// in a 358px track — and the overflow escaped past the scroller to the document instead.
		<Card className="min-w-0 p-0">
			<OverflowScroller ariaLabel="Audit overrides" scrollerClassName={scrollerClassName}>
				{/* Half the shared table measure, because this is half a table: two columns, an
				    audit name and a select. At the full 80rem the pair sat at opposite ends of a
				    1280px row with nothing between them, which reads as two lists rather than as
				    one row of pairs. */}
				<table
					aria-label="Audit overrides"
					className="w-full max-w-[52rem] text-left text-sm">
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
									{/* `wrap-anywhere`, not `break-words`. Both break a long audit name the
									    same way once the line is too narrow; only this one lowers the
									    column's min-content floor, and the floor is what mattered — the
									    longest name held the table 26px wider than the card, which put
									    every row's select 14px past the scrollport edge. Measured across
									    all 42 rows at 390px: the column narrows 252px to 226px and not one
									    row gains a line, because the names were already wrapping where
									    they wrap now. */}
									<td
										className={`border-l-2 px-3 py-2 font-mono wrap-anywhere text-foreground ${
											overridden
												? 'border-accent font-semibold'
												: 'border-transparent font-medium'
										}`}>
										{definition.name}
									</td>
									<td className="px-3 py-2 text-right">
										{/* Sized by its own four options, not by a fixed `w-36`. 144px plus an
										    audit name pushed the row past the card at 390px, and the card
										    clipped it with an overflow that renders no scrollbar on touch —
										    about a third of every select, chevron included, was not hittable,
										    on the one tab whose whole purpose is changing that value. Every
										    row offers the same four words, so the column still lines up. */}
										<select
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
			</OverflowScroller>
		</Card>
	);
}
