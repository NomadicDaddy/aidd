// Each handler group consumes exactly the flags it recognizes and returns the next argv
// index to resume from, or `null` when the flag is not in its group. The flag set across
// groups is disjoint, mirroring the original single `switch` statement one-to-one.
export { applyAuditFlags } from './handlers/audit.ts';
export { applyModeFlags } from './handlers/mode.ts';
export { applyModelFlags } from './handlers/model.ts';
export { applyRunFlags } from './handlers/run.ts';
export { applyServiceFlags } from './handlers/service.ts';
