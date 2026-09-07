import { twMerge } from 'tailwind-merge';

export function cn(...values: (false | null | string | undefined)[]): string {
	return twMerge(...values);
}
