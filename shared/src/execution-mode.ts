export const aiddExecutionModes = {
	singleAgent: 'single_agent',
	triumvirate: 'triumvirate',
} as const;

export type AiddExecutionMode = (typeof aiddExecutionModes)[keyof typeof aiddExecutionModes];

export interface AiddTriumvirateRoleMetadata {
	backend: string;
	model?: string;
}

export interface AiddTriumvirateRoles {
	execution: AiddTriumvirateRoleMetadata;
	overseer: AiddTriumvirateRoleMetadata;
	primary: AiddTriumvirateRoleMetadata;
	secondary: AiddTriumvirateRoleMetadata;
}

export function isAiddExecutionMode(value: unknown): value is AiddExecutionMode {
	return value === aiddExecutionModes.singleAgent || value === aiddExecutionModes.triumvirate;
}
