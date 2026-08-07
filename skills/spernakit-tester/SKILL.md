---
name: spernakit-tester
description: 'Test Spernakit and Spernakit-derived applications by running the general tester skill with Spernakit crawl gates, testing docs, dev-config preconditions, and the in-app bug-report intake bound in. Use for QA runs, regression testing, tester scenarios, role-based workflow verification, or browser-visible defect reporting on a Spernakit app.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: tester, testing-scenarios
    spernakit-references: docs/template/TESTING.md
---

# Test a Spernakit Application

This skill is a thin wrapper around the general `tester` skill. `tester` owns the testing method:
exploration, evidence capture, scripted cases, validation, and output. This file supplies the
Spernakit-specific answers to the questions `tester` would otherwise have to discover.

## Usage

```
spernakit-tester [app] [url] [--scope <route-prefix|workflow>] [--role <role>]
                 [--scenarios <path|id,id>]
```

- Zero args → infer the app from the current repository and use the general `tester` defaults.
- Arguments have the same meanings as `tester`; this wrapper only adds the bindings below.

## How to run

1. Load the staged `tester` contract from `.aidd/skills/tester/SKILL.md` (or
   `skills/tester/SKILL.md` when running inside aidd) and follow it end to end.
2. Replace its **Phase 0: Discover the project's surface** with the bindings below. Everything
   else in `tester` applies unchanged.

## Precondition

Confirm that the target is Spernakit or a Spernakit-derived application: `package.json` carries a
`spernakit_version` field, or the repository is Spernakit itself. If it is not, stop and run
`tester` directly instead. None of the bindings below are required to test an application, and a
non-Spernakit target is not a reason to decline the work.

## Bindings

### Testing documentation

Read `docs/template/TESTING.md` in the target repository. Treat it as the current command
reference when it differs from this skill or from `tester`.

### Lifecycle

| Action                       | Command                          |
| ---------------------------- | -------------------------------- |
| Start the application        | `bun run start` from `{APP_DIR}` |
| Stop an app this run started | `bun run stop` from `{APP_DIR}`  |

The target URL comes from the active application config.

### Automated gates

| Goal                                | Command                                         |
| ----------------------------------- | ----------------------------------------------- |
| Check code quality without mutation | `bun run smoke:qc`                              |
| Crawl an already-running dev app    | `bun run crawltest`                             |
| Crawl one route                     | `bun scripts/crawltest.ts --page /path`         |
| Crawl a route family                | `bun scripts/crawltest.ts --start-from /prefix` |
| Verify routing and error handling   | `bun scripts/crawltest.ts --404`                |
| Capture crawl screenshots           | Add `--screenshot-pages`                        |
| Start, crawl, and stop dev services | `bun run smoke:dev`                             |
| Exercise the preview build          | `bun run smoke:preview`                         |

Read `logs/crawltest.json` after a crawl. Do not run `smoke:reset`, `supertest`, or another
reset-capable gate unless the user explicitly requests that broader validation.

Do not claim that the application works unless `bun run smoke:qc` passes.

### Rate limiting

For rapid multi-role login tests, verify that the active development config sets both
`rateLimit.enabled` and `rateLimit.authEnabled` to `false`. Prefer process-local overrides that
are restored when testing ends. If none exist, preserve persistent configuration and run
rate-aware tests.

### Evidence directory

`{APP_DIR}/screenshots/tester/{SESSION}/`.

### Defect intake

Use the application's bug-report dialog:

- Select **Bug** when an existing capability behaves incorrectly.
- Select **Feature** when the required capability does not exist.
- Put the summary, expected and actual results, reproduction steps, severity, and evidence path
  in the description.
- Prefix scripted findings with the test-case ID.
- Leave the optional reporter email blank unless the user requests otherwise.
- Confirm the success notification and, when possible, the corresponding backend log entry.

Spernakit stores current reports in its database. Do not write a fallback `data/bugs.json` file.
If the dialog is unavailable or submission cannot be confirmed, preserve the finding in the final
results and identify the reporting blocker.
