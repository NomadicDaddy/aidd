import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as EyeOff } from 'lucide-react/dist/esm/icons/eye-off';
import { type ComponentProps, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '../../lib/cn.ts';
import { IconButton } from './button.tsx';
import { Input } from './input.tsx';

interface SecretInputProps extends Omit<ComponentProps<'input'>, 'type' | 'value'> {
	secretName: string;
	value: string;
}

export function SecretInput({
	className,
	disabled,
	secretName,
	value,
	...props
}: SecretInputProps) {
	const [revealed, setRevealed] = useState(false);
	const showControls = disabled !== true && value.length > 0;
	const copyLabel = `Copy ${secretName}`;
	const revealLabel = `${revealed ? 'Mask' : 'Reveal'} ${secretName}`;

	function copySecret(): void {
		if (!showControls) return;
		void navigator.clipboard
			.writeText(value)
			.then(() => toast.success(`${secretName} copied`))
			.catch(() => toast.error(`Could not copy ${secretName}`));
	}

	return (
		<div
			className="relative"
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setRevealed(false);
			}}>
			<Input
				className={cn('font-mono', showControls && 'pr-24 sm:pr-20', className)}
				disabled={disabled}
				type={revealed ? 'text' : 'password'}
				value={value}
				{...props}
			/>
			{showControls ? (
				<div className="absolute inset-y-0 right-0.5 flex items-center gap-0.5">
					<IconButton ariaLabel={copyLabel} onClick={copySecret} variant="ghost">
						<Copy aria-hidden="true" className="h-4 w-4" />
					</IconButton>
					<IconButton
						aria-pressed={revealed}
						ariaLabel={revealLabel}
						onClick={() => setRevealed((current) => !current)}
						variant="ghost">
						{revealed ? (
							<EyeOff aria-hidden="true" className="h-4 w-4" />
						) : (
							<Eye aria-hidden="true" className="h-4 w-4" />
						)}
					</IconButton>
				</div>
			) : null}
		</div>
	);
}
