import type { ModeHandler } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { createAuditMode } from './audit.ts';
import { createCodingMode } from './coding.ts';
import { createDirectiveMode } from './directive.ts';
import { createDirectorMode } from './director.ts';
import { createInterviewMode } from './interview.ts';
import { createTodoMode } from './todo.ts';
import { createValidateMode } from './validate.ts';

export function createModeHandler(plan: RunPlan): ModeHandler {
	switch (plan.mode) {
		case 'audit':
			return createAuditMode(plan);
		case 'coding':
			return createCodingMode(plan);
		case 'directive':
			return createDirectiveMode(plan);
		case 'director':
			return createDirectorMode(plan);
		case 'interview':
			return createInterviewMode(plan);
		case 'todo':
			return createTodoMode(plan);
		case 'triumvirate':
			return createCodingMode(plan);
		case 'validate':
			return createValidateMode(plan);
	}
}
