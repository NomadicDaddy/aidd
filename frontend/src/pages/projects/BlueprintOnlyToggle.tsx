import { Checkbox } from '../../components/ui/checkbox.tsx';

export function BlueprintOnlyToggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
			<Checkbox
				checked={checked}
				className="mt-0.5"
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>
				<span className="block text-sm font-medium text-foreground">
					Stop before implementation (blueprint only)
				</span>
				<span className="mt-0.5 block text-xs text-muted-foreground">
					Create and commit the scaffold, reviewed feature backlog, and roadmap. Start
					building later after review.
				</span>
			</span>
		</label>
	);
}
