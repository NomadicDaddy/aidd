// Re-export the canonical EBUSY-retrying remover (promoted to shared for production worktree
// teardown). Kept here so existing test imports of this path keep working.
export { removeTempTree } from '../../../shared/src/lib/remove-temp-tree.ts';
