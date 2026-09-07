# Feature Authoring Contract

Use this contract only after `doc2feature` confirms that at least one claim is actionable.

## Contents

- [JSON shape](#json-shape)
- [Formatting and naming](#formatting-and-naming)
- [Category mapping](#category-mapping)
- [Spec requirements](#spec-requirements)
- [Consolidated claims](#consolidated-claims)

## JSON shape

Write each feature with these fields and no extra fields unless the target project requires them.
The example uses the alphabetical key order produced by the current aidd and Spernakit formatters:

```json
{
	"affectedFiles": ["path/to/file1", "path/to/file2"],
	"category": "{UI|Backend|Database|Security|Core|Architecture|DevOps}",
	"createdAt": "{current ISO timestamp}",
	"dependencies": [],
	"description": "{One or two sentences describing the issue and required outcome}",
	"id": "remediation-{YYYYMMDD}-{slug}",
	"notes": ["Source: {document filename} | Claims: {claim-ids} | Verified: {YYYY-MM-DD}"],
	"passes": false,
	"priority": {1-5},
	"spec": "1. Verify ...\n2. Verify ...\n3. Verify ...",
	"status": "backlog",
	"title": "{concise title describing the fix}",
	"updatedAt": "{same ISO timestamp}"
}
```

## Formatting and naming

- Use tabs for indentation and `\n` escape sequences for newlines inside the JSON `spec` string.
- Run the target project's formatter over each feature file. Current aidd and Spernakit formatters
  sort JSON keys alphabetically rather than preserving authoring order.
- Keep `dependencies` as an array. Add only existing feature IDs that are real prerequisites.
- Write new `notes` values as arrays. When appending to an existing record, normalize missing/null
  to `[]`, a string to `[existingString]`, and an array to a copy before appending.
- Write `affectedFiles` relative to the project root; never invent a path.
- Use `remediation-{YYYYMMDD}-{slug}` for issue-finding IDs and directories in any repository,
  derived applications included, with today's date rather than the document date. A clean `{slug}`
  is for standalone capability work, which is a question of kind and not of who owns the target.
- Build a unique two-to-four-word lowercase hyphenated slug from the verified root cause.
- Use the same current timestamp for `createdAt` and `updatedAt`.

Examples:

- App missing license signature verification: `remediation-20260830-license-no-signature`
- App volatile in-memory license state: `remediation-20260830-license-state-volatile`
- Spernakit placeholder service implementations: `remediation-20260830-placeholder-service-stubs`
- Spernakit unchecked edition transition: `remediation-20260830-edition-upgrade-bypass`

## Category mapping

| Root cause class                   | Feature category                                                            |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `FE-RENDER`, `FE-FORM`, `FE-ROUTE` | `UI`                                                                        |
| `API-CONTRACT`                     | `Backend`                                                                   |
| `BE-LOGIC`, `BE-VALID`, `BE-ERROR` | `Backend`                                                                   |
| `DB`                               | `Database`                                                                  |
| `AUTH`, `SECURITY-ENFORCEMENT`     | `Security`                                                                  |
| `CONFIG`                           | `Core`                                                                      |
| `INCOMPLETE-IMPL`                  | Match the affected layer: `Backend`, `UI`, or `Core` for cross-cutting work |

Use `Security` whenever the issue enables auth bypass, credential misuse, license-enforcement
bypass, data exposure, or role escalation.

## Spec requirements

Write `spec` as a numbered verification checklist. Start every item with `Verify` and name a
specific file, endpoint, component, field, role, or observable behavior. Never write a generic
item such as `Verify the issue is fixed`.

For security enforcement (`AUTH`, `SECURITY-ENFORCEMENT`), verify:

- the enforcement check exists at the specified location;
- failure blocks the operation rather than warning;
- every entry point is covered;
- HTTP failures use the documented status semantics, including 401 or 403 for authentication and
  authorization failures; and
- the frontend reflects the restriction where relevant.

For incomplete implementations (`INCOMPLETE-IMPL`), verify:

- the named function returns real data rather than empty, stubbed, or hardcoded output;
- its data source exists and is populated;
- the frontend consumes and displays the real result where relevant; and
- data-source failures have defined handling.

For backend defects (`BE-LOGIC`, `BE-VALID`, `BE-ERROR`, `API-CONTRACT`), verify:

- the registered route and exact endpoint when the defect crosses an HTTP boundary;
- the erroneous case now behaves correctly;
- the service response shape matches its caller when a service contract is involved;
- input validation rejects the confirmed invalid case when invalid input is part of the defect; and
- frontend and backend types agree when the contract crosses those layers.

For database defects (`DB`), verify the schema path, the specific field, constraint, or index,
and successful application through the project's established development schema workflow.

For cryptographic or key-management defects, verify the operation and algorithm, the key source,
blocking failure behavior, and absence of a fallback that accepts unverified input.

For UI defects (`FE-RENDER`, `FE-FORM`, `FE-ROUTE`), verify the page or component path, the exact
observable behavior, and route registration when routing is involved.

For configuration defects (`CONFIG`), verify the key exists, the established configuration
boundary validates it, and the affected runtime behavior consumes the corrected value.

## Consolidated claims

When multiple claims share the same file, code path, and root cause, create one feature that:

- records every claim ID in `notes`;
- covers the complete symptom set in `spec`; and
- uses the highest severity, represented by the lowest priority number, from the group.

Keep claims with different root causes as separate features even when they came from one section
of the source document.
