import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.ts';
import { formControlClass } from '../../lib/formStyles.ts';

export function Input({ className, ...props }: ComponentProps<'input'>) {
	return <input className={cn(formControlClass, className)} {...props} />;
}
