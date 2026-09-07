/** Fixture-backed contract gates, kept together so the main QC registry stays below 300 lines. */
export const GATE_CONTRACT_STEPS = [
	{
		command: ['bun', 'run', 'test:gate-conventions'],
		description: 'The gate rule library still fails a deliberately non-conforming fixture',
		label: 'test:gate-conventions',
		name: 'test:gate-conventions',
	},
	{
		command: ['bun', 'run', 'test:api-types'],
		description: 'The API parity gate rejects enum, optionality, field, and inventory drift',
		label: 'test:api-types',
		name: 'test:api-types',
	},
	{
		command: ['bun', 'run', 'test:audit-evals'],
		description: 'The audit eval gate rejects missed defects and false-positive decoys',
		label: 'test:audit-evals',
		name: 'test:audit-evals',
	},
	{
		command: ['bun', 'run', 'test:media-provenance'],
		description: 'The media provenance gate rejects a deliberately marked binary fixture',
		label: 'test:media-provenance',
		name: 'test:media-provenance',
	},
	{
		command: ['bun', 'run', 'check:gate-conventions'],
		description: 'Every gate follows the conventions in docs/reference/gate-conventions.md',
		label: 'check:gate-conventions',
		name: 'check:gate-conventions',
	},
	{
		command: ['bun', 'run', 'check:api-types'],
		description: 'Independent Director API request and response types match the backend',
		label: 'check:api-types',
		name: 'check:api-types',
	},
	{
		command: ['bun', 'run', 'check:audit-evals'],
		description: 'Audit definitions retain a current above-floor planted-defect attestation',
		label: 'check:audit-evals',
		name: 'check:audit-evals',
	},
];
