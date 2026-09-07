export function authTokenDialogReadiness(draft: string, token: string, verifying: boolean) {
	const normalizedDraft = draft.trim();
	return {
		clearDisabled: verifying || token.length === 0,
		saveDisabled: verifying || normalizedDraft.length === 0 || normalizedDraft === token,
	};
}
