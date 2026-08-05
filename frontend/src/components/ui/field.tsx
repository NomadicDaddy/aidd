import type { LabelHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';

interface FieldRowProps extends LabelHTMLAttributes<HTMLLabelElement> {
	children: ReactNode;
	label: ReactNode;
	labelHidden?: boolean;
}

export function FieldRow({
	children,
	className,
	label,
	labelHidden = false,
	...props
}: FieldRowProps) {
	return (
		<label className={cn('grid gap-1', className)} {...props}>
			<span className={cn(fieldLabelClass, labelHidden && 'sr-only')}>{label}</span>
			{children}
		</label>
	);
}
