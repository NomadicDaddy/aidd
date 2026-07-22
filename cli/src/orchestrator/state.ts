import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../prompts/types.ts';

export type OrchestratorState =
	| { error: unknown; type: 'failed' }
	| { plan: RunPlan; prompt: CompiledPrompt; type: 'run_agent' }
	| { plan: RunPlan; type: 'compile_prompt'; work: unknown }
	| { plan: RunPlan; type: 'select_work' }
	| { reason: string; type: 'stopped' }
	| { result: AgentRunResult; type: 'process_result' }
	| { result: AgentRunResult; type: 'write_artifacts' }
	| { summary: string; type: 'complete' }
	| { type: 'planning' };
