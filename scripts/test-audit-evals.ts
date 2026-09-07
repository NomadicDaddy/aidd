#!/usr/bin/env bun
/** Executable regression for the audit-eval scorer and attestation gate. */
import path from 'node:path';
import { exit } from 'node:process';

import { runAuditEvalSelfTest } from './lib/audit-eval/self-test.ts';

if (import.meta.main) {
	exit(await runAuditEvalSelfTest(path.join(import.meta.dir, '..')));
}
