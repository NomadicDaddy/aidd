import type { FacetDef, FacetField } from './profile-facets.ts';

import { Badge } from '../../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../../components/ui/card.tsx';
import { cn } from '../../../../lib/cn.ts';

export function FacetCard({
	facet,
	onChange,
	value,
}: {
	facet: FacetDef<string>;
	onChange: (field: FacetField, value: string) => void;
	value: string;
}) {
	return (
		<Card>
			<fieldset>
				{/* Both facts, not one. The `fieldset`/`legend` pairing is the right semantic for a
				    radio set and it stays, but a legend is not a heading: an interactive snapshot of
				    this tab returned three headings for a page carrying nine card titles, so heading
				    navigation skipped the whole form while the eight titles it skipped rendered at
				    the same rank as the `CardHeader` h2s on the Management and Audits tabs. */}
				<legend className="sr-only">{facet.title}</legend>
				<CardHeader
					className="mb-3"
					description={facet.description}
					headingLevel={3}
					level="subsection"
					title={facet.title}
				/>
				<div className="grid gap-2">
					{facet.options.map((opt) => {
						const selected = opt.value === value;
						return (
							<label
								className={cn(
									// `rounded-lg` is the control step of the three the baseline
									// defines; `rounded-md` is not one of them, and a radio row is
									// a control.
									'flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors max-sm:min-h-11',
									// Tokens, not palette steps: the hand-picked teal did not match
									// --accent-muted, so a selected option here read a different
									// green-teal than the selected tab pill directly above it.
									// `hover:border-border` was a no-op — the same colour the rest
									// state already sets — so `transition-colors` above it had
									// nothing to transition and a row that changes the project
									// profile on click acknowledged nothing on approach. The
									// accent border is `ui/card`'s own `interactive` hover, so a
									// row previews the colour its selected state will land on.
									selected
										? 'border-accent bg-accent-muted text-accent-muted-foreground'
										: 'border-border hover:border-accent/40',
								)}
								key={opt.value}>
								<input
									checked={selected}
									className="mt-1 accent-[var(--accent)]"
									name={facet.field}
									onChange={() => onChange(facet.field, opt.value)}
									type="radio"
									value={opt.value}
								/>
								<span className="min-w-0">
									<span className="flex flex-wrap items-center gap-1.5">
										<span className="text-sm font-medium text-foreground">
											{opt.label}
										</span>
										{/* Real Badges. These were the fourth pill style on a screen
										    that already showed three, at a font size below the app's
										    smallest step; the ⊕/⊖ glyphs were carrying meaning the
										    tone now carries. */}
										{opt.hardening && (
											<Badge
												title="Selecting this value forces full hardening (requiresFullHardening)"
												tone="red">
												full hardening
											</Badge>
										)}
										{opt.lowExposure && (
											<Badge
												title="One of the values permitted by a low-exposure local profile"
												tone="emerald">
												low exposure
											</Badge>
										)}
									</span>
									<span className="mt-0.5 block text-xs text-muted-foreground">
										{opt.blurb}
									</span>
								</span>
							</label>
						);
					})}
				</div>
			</fieldset>
		</Card>
	);
}
