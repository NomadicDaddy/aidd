---
name: rbac
description: 'Reconcile RBAC documentation and the Roles page with application-specific resources. Use when role, permission, route, API, or resource coverage is incomplete or inconsistent.'
metadata:
    aidd-category: metadata
---

# RBAC

Use `$ARGUMENTS` as the optional target application or additional RBAC requirements. Resolve the
target and incorporate any supplied requirements before reviewing or changing documentation.

Update RBAC documentation and implementation for comprehensive role coverage.

Execution steps:

1. **Identify application context**:
    - Determine which application from workspace or $ARGUMENTS
    - Load application-specific resource requirements
    - Identify application name for documentation (e.g., "Example App", "Operations Portal", "Scheduling App")

2. **Update RBAC documentation**:
    - **`docs/template/RBAC.md` is a pure template copy.** `spernakit-diff-sync` requires everything under `docs/template/` to be byte-identical to the template, with no branding substitutions. **Never** update application-name references or add app-specific resources inside it in a derived app; `check:drift` will revert such edits. Only edit this file when working in the Spernakit template repository itself.
    - Document application-specific RBAC details **outside** `docs/template/` (e.g., `docs/internal/RBAC.md`): the app's resource list, app-specific permission matrix rows, and application-name-specific examples.
    - In whichever document applies (template file in Spernakit, app-specific doc in derived apps):
        - Ensure SYSOP role is fully documented in role hierarchy section
        - Document SYSOP complete permissions and use cases
        - Update permission matrix to include SYSOP with full access for all resources
        - Verify all application-specific resources are covered in the permission matrix (app-specific doc only)
        - Ensure five-tier hierarchy is clear: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER
    - Verify code examples reference correct v3 file paths:
        - Role types/hierarchy: `shared/src/roles.ts` (spernakit-shared package)
        - Backend re-exports: `backend/src/types/roles.ts`
        - Guards: `backend/src/guards/role.ts` (requireRoleFresh, canModifyRole, assertUser)
        - Workspace guards: `backend/src/guards/workspaceAccess.ts`
        - Frontend auth: `frontend/src/hooks/useAuthorization.ts` (hasMinRole, can, isSysop)
        - Frontend route protection: `frontend/src/components/auth/ProtectedRoute.tsx`
        - Role config schema: `backend/src/config/configSchemas/roles.ts`
    - Verify role management rules use strict inequality (requesterLevel > targetLevel)
    - Ensure UI examples use shadcn/ui components (NOT DaisyUI classes)
    - Write any new or rewritten documentation prose to the humanize-docs skill's style contract (apply the humanize-docs skill to drafted text before saving): plain natural language, no em-dashes, no AI filler. The permission matrix, role names, and code references stay exact.

3. **Update Roles page** (`frontend/src/pages/settings/roles/RolesTab.tsx`):
    - Update ROLE_DEFINITIONS array to include all application-specific permissions per role
    - All five roles (SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER) are displayed as role cards
    - Update application-specific descriptions and resource names in permissions lists
    - Verify roleLabels config integration for customizable display names per app
    - Ensure role cards show correct hierarchy levels and badge variants

4. **Validate consistency**:
    - Confirm five-tier role hierarchy maintained everywhere
    - Verify SYSOP has unrestricted access in documentation
    - Verify all five roles are displayed in RolesTab role cards
    - Check application-specific customizations are preserved in ROLE_DEFINITIONS
    - Verify all implementation notes reference correct v3 file paths
    - Confirm role management uses strict inequality (no same-level management)
    - Verify roleLabels config schema matches role card defaults

5. **Test implementation**:
    - Run `bun run smoke:qc` - must pass (exit code 0)
    - Load Settings > Roles page in browser
    - Verify all five role cards display correctly
    - Confirm no console errors

6. **Report completion**:
    - Summarize documentation updates
    - List UI changes made
    - Confirm consistency requirements met
    - Note any application-specific customizations

Consistency requirements:

- Five-tier role hierarchy: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER
- SYSOP has unrestricted access in documentation
- All five roles displayed in RolesTab role cards
- Role management uses strict inequality (requesterLevel > targetLevel)
- Application-specific resources properly documented
- All implementation notes reference correct v3 file paths
- UI uses shadcn/ui components and useAuthorization hook
- roleLabels config allows per-app display name customization
