import { toast } from 'sonner';

/**
 * The error handler for an action that would otherwise fail in silence: names what was being done
 * and carries the server's reason.
 *
 * A mutation with no onError in its hook and none at its call site fails with nothing on screen;
 * the button re-enables and the operator is left to guess whether the click registered. This is
 * for those, so the wording is the same everywhere: "<what> failed: <why>".
 */
export function reportFailure(action: string): (error: unknown) => void {
	return (error) => {
		toast.error(`${action} failed`, {
			description:
				error instanceof Error && error.message ? error.message : 'No reason was given.',
		});
	};
}
