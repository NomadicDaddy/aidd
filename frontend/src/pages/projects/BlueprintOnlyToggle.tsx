import { FieldCheckbox } from '../../components/ui/field.tsx';

export function BlueprintOnlyToggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<FieldCheckbox
			checked={checked}
			description="Create and commit the scaffold, reviewed feature backlog, and roadmap. Start building later after review."
			label="Stop before implementation (blueprint only)"
			onChange={(event) => onChange(event.target.checked)}
		/>
	);
}
