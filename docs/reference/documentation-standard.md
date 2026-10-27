# Documentation standard

Use this organization for owned products across the fleet. It gives readers a consistent route
from installation to ordinary tasks, then to exact reference and contributor detail. Apply it
through a scoped owner-led change; adopting the standard does not start a fleet migration.

## Reader paths

| Location                       | Purpose                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `README.md`                    | Short product introduction, prerequisites, first command, and links to the docs index and first-use guide. |
| `docs/README.md`               | Index organized by reader goal, with reachable first-use, task, reference, and contributor paths.          |
| `docs/getting-started.md`      | Supported installation through the first useful result, including a result check and recovery.             |
| `docs/guides/<task>.md`        | One task's outcome, prerequisites, authority, steps, expected result, and recovery.                        |
| `docs/reference/<topic>.md`    | Exact commands, settings, interfaces, storage, constraints, and limits.                                    |
| `docs/architecture/<topic>.md` | Contributor mechanisms, design tradeoffs, and component relationships.                                     |
| `docs/adr/<decision>.md`       | Durable decisions and their rationale.                                                                     |
| `docs/CHANGELOG.md`            | The product's public release history.                                                                      |

Create only pages and directories that carry useful content. A small CLI may need only first use
and a task/reference page. Do not add empty sections to imitate a larger application.

For new or migrated first-use pages, use `getting-started.md`. Existing well-linked first-use
paths remain reachable until the owner updates their consumers together. In aidd the current
first-use page is `docs/quickstart.md`; this standard does not rename it. Use lower-case kebab-case
for new page names, except `README.md` and `CHANGELOG.md`.

Keep legal and platform files such as `LICENSE`, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`,
privacy statements, and third-party notices where their real consumers expect them. `CONTEXT.md`
remains the registered root context artifact.

## Writing and navigation

Start with what the reader wants to do. A first-use guide names actual prerequisites, installation
steps, any required account or provider sign-in, the shortest supported workflow, its observable
result, and a useful
failure/recovery path. A task guide states any authority requirement before the step that needs it.
Keep sending, deleting, approving, restarting, and publishing distinct when the product does.

Verify commands, options, defaults, limits, and procedures against current source and behavior.
Preserve qualifications and accurate passages. Use the `humanize-docs` style contract; a review
may leave effective prose unchanged. Do not invent screenshots, commands, verification, or product
capabilities to complete a page.

Use Markdown links relative to the containing file. Check target files, fragments, navigation,
and the actual renderer. Use the external or GitHub path when a renderer requires it, rather than
copying a repository-root-relative path into a nested page. Every new guide needs an index or
other real reader path to it.

In-app help and public websites are documentation consumers too. Keep one owned source per topic
or document the actual source/projection relationship. In aidd, `frontend/content/docs/` supplies
the panel's Docs pages; repository manuals must not silently replace or orphan those pages.
Public article slugs, narrative archives, historical ADRs, and upstream material retain their
purpose and provenance.

## Public release history

Use `docs/CHANGELOG.md` for one active public product history. Preserve released versions, dates,
and release boundaries. Write reader-visible changes from verified evidence, rather than copying
private run logs or feature records into public prose.

`.aidd/CHANGELOG.md` is a separate local per-change record. Preserve its date-headed format and
Git-ignore protection; never force-add it or publish it wholesale. Existing root changelogs remain
discoverable until their owner performs the path migration. Discovery of a root file does not
authorize moving it during an unrelated documentation update.

Move the public history and its consumers in one coordinated change. Inspect package file lists,
installer payloads, release/version validators, historical Git-baseline reads, fixtures and tests,
support/site links, CI/release automation, and skill/recipe discovery. Preserve the historical
baseline behavior deliberately and test it. Do not leave a permanent second changelog, disable a
release guard, or introduce an unapproved compatibility layer to make the move pass.

Spernakit's `docs/template/CHANGELOG.md` is the explicit template-product exception. Preserve its
template boundary and consumers. Derived-app history describes that app, not the template's
releases. Attributed historical archives are not additional active changelogs.

## Planning prose and feature records

For aidd-managed products, reconcile executable planning into existing or new
`.aidd/features/<id>/feature.json` records and `.aidd/roadmap.json`. Follow the
[feature field contract](./feature-fields.md) and the [artifact catalog](./artifacts.md).
Do not create `.aidd` in a non-managed repository merely to normalize its documentation.

Before removing a root TODO, FUTURE, or other planning file, create a clause ledger. Give each
top-level item a stable key and preserve its nested constraints, original wording or a retained
full-text source, source path/lines and content hash, authority, existing feature match, missing
clauses, evidence, current state, milestone, and proposed action. Account for ambiguous and
cross-project items with their owner. Remove the source only after the owner accepts complete
coverage, including unresolved questions.

Match behavior and intent against all current features before creating a record. Amend an
existing parent when it covers the same capability. Use `spec` for net-new capability planning,
`doc2feature` for verified prose issue claims, and `update-roadmap` for mapping; their scopes and
write permissions still apply.

Preserve existing IDs, notes/provenance, status, `passes`, priority, dependencies, blockers, and
roadmap milestones. Milestones belong in `roadmap.json` under `features[directory].milestone`.
Every feature needs a valid defined milestone when that roadmap exists. Preserve the manual
`.aidd/roadmap.md` companion and the independence of feature priority from milestone placement.

Existing `backlog`, `in_progress`, `waiting_approval`, `deferred`, and completed history retain their states and
restrictions. A new undecided proposal stays `waiting_approval` with `passes: false` and appropriate
future placement. Planning migration does not approve implementation. Only the operator changes
the human-controlled deferred state or releases an approval hold.

A checked TODO is historical evidence, not proof of completed source or live acceptance. An
unchecked item may already have an implemented parent with outstanding acceptance. Keep source
proof, built-artifact checks, functional tests, native/user acceptance, and human decisions
separate. Preserve unresolved product choices and acceptance work instead of closing them from a
checkbox or recreating completed work as backlog.

## Project boundaries

- Spernakit's `docs/template/` remains its template-product boundary. Derived apps need their own
  product instructions and must respect template ownership and `.templateoverrides`.
- Editorial sites retain public articles, slugs, and narrative archives; contributor publishing
  instructions are a separate reader path.
- BBS, Amiga, infrastructure, and script projects emphasize operator procedures and recovery.
  Preserve machine notes and upstream material; classify applicability before moving files.
- Profile repositories, proofs of concept, upstream clones, retired projects, and artifact-only
  directories need owner classification. Do not invent product release history or manuals.
- Shared delivered files belong to smokestack. Change their source through its owner and delivery
  process; never patch a consumer copy. Existing delivery and template holds remain in effect.

## Maintenance and migration

`update-application-documentation` maintains existing docs. Its existing-files-only steps cannot
create a missing manual, move release history, or reconcile a root planning file. Report such gaps
for a separately scoped authoring/migration phase. Do not broaden an already-running recipe or
start a competing writer. Other skills may create a named missing artifact only within their
actual invocation and the user's authority.

An owner-led migration inventories current files and consumers, settles the layout and clause
ledger, then changes the approved paths together. Preserve unrelated dirty work and recheck it
before staging. Keep project-specific runtime, packaging, UI, and editorial consumers with their
owners. The [artifact catalog](./artifacts.md) remains the source for aidd artifact writers,
protected/manual/runtime records, and staged references; this layout does not replace it.

For completion, report changed paths and evidence for:

1. README, index, first use, and task pages are reachable; procedures match actual behavior.
2. Markdown links and affected rendered/in-app routes work in their real consumers.
3. Packages/installers include intended docs; current and historical release validation still work.
4. Every planning clause is retained in the accepted ledger and mapped feature, with state,
   milestone, provenance, dependencies, and unresolved decisions preserved.
5. Named-file formatting, documentation/metadata checks, and the project's required quality gate
   finish successfully. Respect required compute slots and existing cached gates.
6. Any claimed first-use or task acceptance names the actual environment and workflow checked.
   Source review and a tidy tree alone do not establish user acceptance.

Report untested consumers and remaining owner decisions explicitly. Documentation changes grant
no lifecycle action, replay, hold release, push, publication, or deployment permission.
