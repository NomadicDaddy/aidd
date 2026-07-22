import type { InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn.ts';
import { formControlClass } from '../../lib/formStyles.ts';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return <input className={cn(formControlClass, className)} {...props} />;
}
