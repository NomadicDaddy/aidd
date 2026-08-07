import type { FacetDef, FacetField } from './profile-facets.ts';

import { Badge } from '../../../../components/ui/badge.tsx';
import { Card } from '../../../../components/ui/card.tsx';
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
				<legend className="text-sm font-semibold text-foreground">{facet.title}</legend>
				<p className="mt-0.5 mb-3 text-xs text-muted-foreground">{facet.description}</p>
				<div className="grid gap-2">
					{facet.options.map((opt) => {
						const selected = opt.value === value;
						return (
							<label
								className={cn(
									'flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors max-sm:min-h-11',
									// Tokens, not palette steps: the hand-picked teal did not match
									// --accent-muted, so a selected option here read a different
									// green-teal than the selected tab pill directly above it.
									selected
										? 'border-accent bg-accent-muted text-accent-muted-foreground'
										: 'border-border hover:border-border',
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
