import type { Static } from 'elysia';

import { type BackendName, backendNames } from 'aidd-shared/plan/types';
import { t } from 'elysia';

export const backendNameBody = t.Union(backendNames.map((name) => t.Literal(name)));

// Locks the runtime-derived union to the canonical shared type: if backendNames
// changes shape in a way that breaks the schema, this line fails to compile.
type _AssertBackendBody =
	Static<typeof backendNameBody> extends BackendName
		? BackendName extends Static<typeof backendNameBody>
			? true
			: never
		: never;
const _assertBackendBody: _AssertBackendBody = true;
void _assertBackendBody;
