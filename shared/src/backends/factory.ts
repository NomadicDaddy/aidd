import type { AiCallSurface } from '../lib/aiCallLog.ts';
import type { BackendName } from '../plan/types.ts';
import type { CLIBackend } from './types.ts';

import { NativeBackend } from './native.ts';
import { createProcessCliBackend } from './process-cli-backend.ts';

export function createBackend(name: BackendName, callSurface?: AiCallSurface): CLIBackend {
	switch (name) {
		case 'claude-code':
		case 'cline':
		case 'codex':
		case 'grok':
		case 'kilocode':
		case 'opencode':
			return createProcessCliBackend(name);
		case 'lmstudio':
			return new NativeBackend(
				callSurface
					? { callSurface, name: 'lmstudio', providerOverride: 'lmstudio' }
					: { name: 'lmstudio', providerOverride: 'lmstudio' },
			);
		case 'native':
			return new NativeBackend(callSurface ? { callSurface } : {});
		case 'ollama':
			return new NativeBackend(
				callSurface
					? { callSurface, name: 'ollama', providerOverride: 'ollama' }
					: { name: 'ollama', providerOverride: 'ollama' },
			);
		case 'openai':
			return new NativeBackend(
				callSurface
					? { callSurface, name: 'openai', providerOverride: 'openai' }
					: { name: 'openai', providerOverride: 'openai' },
			);
	}
}
