import type { FacetDef, FacetField } from './profile-facets.ts';

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
									'flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors',
									selected
										? 'border-teal-400 bg-teal-50/70 dark:border-teal-700 dark:bg-teal-950/30'
										: 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700',
								)}
								key={opt.value}>
								<input
									checked={selected}
									className="mt-1 accent-teal-600"
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
										{opt.hardening && (
											<span
												className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
												title="Selecting this value forces full hardening (requiresFullHardening)">
												⊕ full hardening
											</span>
										)}
										{opt.lowExposure && (
											<span
												className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
												title="One of the values permitted by a low-exposure local profile">
												⊖ low-exposure
											</span>
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
