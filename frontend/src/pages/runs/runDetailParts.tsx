import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';

export function MetadataItem({
	className,
	label,
	value,
}: {
	className?: string;
	label: string;
	value: string;
}) {
	return (
		<div className={cn('flex min-w-0 flex-col', className)}>
			<dt className={fieldLabelClass}>{label}</dt>
			<dd className="min-w-0 text-xs break-words text-foreground">{value}</dd>
		</div>
	);
}

export function ReadOnlyContractViolation() {
	return (
		<div
			className={cn(
				'rounded-md border p-2 text-xs',
				toneBorder.red,
				toneSurface.red,
				toneText.red,
			)}>
			<strong>Read-only contract violation.</strong> This skill directive was instructed not
			to modify the project, but its run evidence includes file changes or commits. aidd
			preserved the evidence and did not automatically revert any work.
		</div>
	);
}
