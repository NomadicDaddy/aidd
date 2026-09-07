import { default as Upload } from 'lucide-react/dist/esm/icons/upload';

import { Button } from '../../components/ui/button.tsx';

export function SkillsHeaderActions({ onImport }: { onImport: () => void }) {
	return (
		<div className="flex gap-2">
			<Button onClick={onImport} size="toolbar" variant="secondary">
				<Upload aria-hidden="true" className="h-4 w-4" />
				Import skill
			</Button>
		</div>
	);
}
