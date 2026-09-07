#!/usr/bin/env bun
/** Regression test for the executable API type parity gate. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

interface RunResult {
	exitCode: number;
	output: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks += 1;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'api-types-'));

function write(relativePath: string, content: string): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function runCheck(): RunResult {
	const result = Bun.spawnSync(['bun', 'run', 'check:api-types', '--', '--root', fixtureRoot], {
		cwd: repoRoot,
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

const routeSource = `
import { Elysia } from 'elysia';
new Elysia({ prefix: '/api/v1/example' })
	.get('/items', () => ({}))
	.post('/items', () => ({}));
`;
const frontendApiSource = `
declare function apiGet<T>(path: string): Promise<T>;
declare function apiSend<T>(path: string, method: string, body: unknown): Promise<T>;
export function createItem(input: unknown) {
	return apiSend<Response>('/api/v1/example/items', 'POST', input);
}
function buildQuery(input: unknown): string { return input ? '?page=1' : ''; }
export function listItems(input: unknown) {
	return apiGet<Response[]>(\`/api/v1/example/items\${buildQuery(input)}\`);
}
`;
const backendTypes = `
export type InvocationSource = 'cli' | 'recipe-step' | 'scheduled' | 'web';
export interface Request { label?: string; status: 'closed' | 'open' }
export interface Response { id: string; source: InvocationSource; status: 'closed' | 'open' }
`;
const frontendTypes = backendTypes;
const inventory = {
	surfaces: [
		{
			backendRoute: 'backend/src/routes/example.ts',
			contracts: [
				{
					endpoint: 'GET /api/v1/example/items',
				},
				{
					endpoint: 'POST /api/v1/example/items',
					request: {
						backend: { exportName: 'Request', module: 'backend/src/types.ts' },
						frontend: { exportName: 'Request', module: 'frontend/src/api/types.ts' },
					},
					response: {
						backend: { exportName: 'Response', module: 'backend/src/types.ts' },
						frontend: { exportName: 'Response', module: 'frontend/src/api/types.ts' },
					},
				},
			],
			frontendModule: 'frontend/src/api/example.ts',
			pathPrefix: '/api/v1/example',
		},
	],
};

function resetFixture(frontend = frontendTypes): void {
	write('backend/src/routes/example.ts', routeSource);
	write('backend/src/types.ts', backendTypes);
	write('frontend/src/api/example.ts', frontendApiSource);
	write('frontend/src/api/types.ts', frontend);
	write('scripts/api-type-inventory.json', `${JSON.stringify(inventory, null, '\t')}\n`);
	write(
		'tsconfig.json',
		JSON.stringify({ compilerOptions: { exactOptionalPropertyTypes: true, strict: true } }),
	);
}

try {
	resetFixture();
	let result = runCheck();
	assert(result.exitCode === 0, `Matching contracts must pass:\n${result.output}`);
	assert(
		result.output.includes('2 endpoint(s) and 2 request/response contract(s)'),
		result.output,
	);

	resetFixture(frontendTypes.replace("'closed' | 'open'", "'closed' | 'open' | 'paused'"));
	result = runCheck();
	assert(result.exitCode === 1, `A changed enum member must fail:\n${result.output}`);

	resetFixture(frontendTypes.replace(" | 'scheduled'", ''));
	result = runCheck();
	assert(
		result.exitCode === 1,
		`A missing scheduled invocation source must fail:\n${result.output}`,
	);

	resetFixture(frontendTypes.replace('label?: string', 'label: string'));
	result = runCheck();
	assert(result.exitCode === 1, `An optionality mismatch must fail:\n${result.output}`);

	resetFixture(frontendTypes.replace('id: string; ', ''));
	result = runCheck();
	assert(result.exitCode === 1, `A missing response field must fail:\n${result.output}`);

	resetFixture();
	write('scripts/api-type-inventory.json', '{"surfaces":[]}\n');
	result = runCheck();
	assert(
		result.exitCode === 1 && result.output.includes('contains no API surfaces'),
		`A vacuous inventory must fail:\n${result.output}`,
	);

	resetFixture();
	write(
		'frontend/src/api/example.ts',
		frontendApiSource.replace(
			'}\n',
			"}\nexport const createOther = () => apiSend<Response>('/api/v1/example/other', 'POST', {});\n",
		),
	);
	result = runCheck();
	assert(result.exitCode === 1, `An un-inventoried endpoint must fail:\n${result.output}`);

	resetFixture();
	write(
		'frontend/src/api/uninventoried.ts',
		'declare function apiGet<T>(path: string): Promise<T>;\n' +
			"export const getOther = () => apiGet<unknown>('/api/v1/example/other');\n",
	);
	result = runCheck();
	assert(
		result.exitCode === 1 && result.output.includes('lacks an inventory surface'),
		`An un-inventoried frontend API module must fail:\n${result.output}`,
	);

	console.log(`[OK] API type parity test passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
