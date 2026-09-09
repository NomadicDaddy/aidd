# Changelog

All notable public aidd releases are documented here.

## [3.0.2] - 2026-09-09

### Changed

- The operational documentation now describes what aidd actually does with a project. Managed writes are scoped, but that is not a host-level filesystem boundary: an agent or recipe shell command runs with your account's permissions. Completion recovery can commit source changes in an existing project after checking that the dirty paths were clean at run start, were recorded as written by the run, and pass the project's gate. Operator-configured shared directories and files can overwrite matching files during scaffolding, unlike the bundled starter files. A test suite fails if any of those claims drifts back.
- Quickstart no longer calls the metadata checks non-mutating. `--check-features` and `--check-artifacts` leave application code alone, and `--check-artifacts` writes `.aidd/.artifacts-check.json`.
- The deployment reference documents the postinstall frontend build, that restarting the backend does not rebuild the UI, and the backend's own log check every 30 seconds with its 10 MiB threshold, five archives, and 30-day retention.
- In-app documentation is more honest about limits. The FAQ explains that local storage does not keep prompts and project content off a remote provider, that a recent heartbeat means a run is still reporting rather than making useful progress, and that unattended launches require both the paused Director fleet cycle and Suggestion Auto-Launch to be turned on. Getting Started adds a step for reviewing run output, file changes, and validation evidence before accepting a result. The Dashboard page documents the Fleet Maturity and Recent Activity cards.
- Recipe badges, the re-intake card, and the Settings sections now state their consequences before you act. Built-in recipes can have their steps edited but not be renamed or deleted, a metadata-only recipe requests an `.aidd/`-only write allowlist rather than a shell sandbox, re-intake returns existing backlog and in-progress features to approval, saving a network-access change restarts the panel, and the Director chat file-edit permission also covers Telegram.
- The public site pages were rewritten with corrected privacy and validation claims, the right Bun version requirement, a working Flask example, the workflow section ahead of the backend comparison, and a screenshot of the real dashboard in place of generated artwork.
- The `humanize-docs` skill is now a review-and-edit contract rather than a rewrite instruction. It establishes voice from real samples, decides how much editing the text needs (including leaving good prose alone), and treats factual scope and required coverage as outranking style heuristics.
- The `devdiary-update` skill accepts explicit repository paths, names its default scan roots, recognizes worktrees whose `.git` is a file, and deduplicates repositories by their resolved top-level path.

### Fixed

- A project reached through an aliased path (a Windows `subst` drive, a symlink, or a junction) is recognized as owning its own Git repository. Repository ownership is now decided by an empty `git rev-parse --show-prefix` instead of comparing `--show-toplevel` against the path aidd was given, which never matched. Previously the history guard could try to re-initialize an existing repository, and every commit a run made went unattributed.
- Test coverage results survive the same aliased paths. Coverage source paths resolve through the filesystem before the inside-the-project check, and when one source appears under more than one LCOV record the fuller measurement is kept instead of being overwritten by a barely-exercised duplicate.
- A project with no runs and no pipelines no longer shows an animated "Preparing blueprint" spinner. Blueprint readiness reports incomplete setup and names the missing onboarding artifacts; progress wording appears only when a run or pipeline for that project is actually working, and a finished run can no longer leave a stale spinner behind.

## [3.0.1] - 2026-09-08

### Changed

- The About page and page metadata now describe aidd consistently as a local control panel for planning, running, and auditing AI coding work.

### Fixed

- Project intake documentation now lists all four existing lanes and explains that the template lane always includes Spernakit.
- Release validation now preserves public changelog history while rejecting duplicate, out-of-order, and pre-baseline entries.

## [3.0.0] - 2026-09-07

Initial public release. aidd is a local-first orchestration runtime and control panel for running
AI coding backends against one project or a whole fleet, with structured results, audits, run
history, and telemetry kept on the operator's own machine.

### Added

- **Runtime and backends.** A pure TypeScript orchestration engine on Bun 1.4.2 that drives ten
  backends: the native OpenAI-compatible client (any hosted provider, plus Ollama and LM Studio
  locally) and the Claude Code, Cline, codex, grok, kilocode, and opencode CLIs. Every run produces
  structured iteration artifacts under `.aidd/`, and one launch-target resolver decides the CLI,
  model, and reasoning effort for every surface that starts work.
- **Local control panel.** Dashboard, Projects, Runs, Director, Pipelines, Scheduled Tasks, Audits,
  Skills, Recipes, Telemetry, Diary, Settings, in-app documentation, and an embedded terminal with
  persistent PTY sessions, all served on loopback for a single operator. Page rails, tables,
  filters, focus treatment, overflow cues, and responsive breakpoints are consistent across every
  workspace, and Markdown surfaces render tables, inline code, lists, and definition content
  without losing their structure. The About page identifies both the runtime and the frontend
  build.
- **Projects.** Four creation lanes: create fresh, scaffold from a registered template, clone a
  GitHub template repository with fresh history, or ingest an existing codebase. A directory carrying its own `.aidd` metadata or an active run is
  enumerable as a project at any allowed root. Every project path has one canonical spelling
  across discovery, runs, schedules, diary entries, launches, telemetry, deletion, and move checks.
  Feature lists show Added and Completed dates, sort on every column on desktop and mobile, and
  keep the chosen ordering in the URL. The
  project History tab interleaves feature, remediation, audit-finding, run, and diary events in one
  descending timeline, ordering a diary entry by when it was written rather than by the calendar day
  it describes, so an entry lands among the runs it narrates instead of beneath all of them. A
  project's repository panel lists tag names beside its other refs.
- **Project maturity.** Every project is scored across seven stages, from Specified through Shipped,
  from the artifacts it actually has: each required artifact reports whether it exists, is fresh, or
  has gone stale past thirty days, audits contribute their report freshness and last pass or fail,
  and the project's assurance profile decides which audits apply. The current stage is the first
  incomplete one, with the next artifact named and a one-click invocation to produce it. A project
  may skip artifacts that do not apply to it, and skipped artifacts count as complete. The fleet
  dashboard carries the projection as two cards: fleet Maturity, and a fleet-wide Recent Activity
  list whose rows name and link to their projects. Both are served from the bounded dashboard
  summary rather than the full project list, and both render their own loading, error, and empty
  states without disturbing the cards beside them. The Director defers audit-class work for a
  project below the `engaged` stage by capping its risk rather than hiding it, and records the
  stage and the deferral on the work item so the reason is legible.
- **Runs.** Every run records the skill, audit, recipe, or directive that drove it, with a
  canonical content hash, and who started it: Operator when a person asked — a Launch click, the
  CLI, an MCP call, a request to the Director, or Run now on a scheduled task — and Automatic when
  aidd decided, such as a scheduled occurrence the timer fired, a catch-up sweep, an automatic
  Director cycle, or an auto-chained follow-up. The answer is decided where the launch happens
  rather than inferred from the surface it arrived on. The Runs list carries the badge and filters
  on it, the detail panel states it, and `get_run` and `run_output` return it; a run with no
  recorded initiator reads as Unknown rather than being guessed at. Run and pipeline views keep
  nested steps with their parents, report progress and liveness from current evidence, page
  through oversized transcripts, and drop Claude Code's `tool_progress` heartbeats from the parsed
  stream while Raw view and Copy all keep the verbatim transcript. Model tags containing an
  underscore, such as `llama3.1:8b-instruct-q4_K_M`, are accepted. The run detail panel
  states the run's source — CLI, Director, or Web — with the same label the table row used, and
  reports the final checks the run recorded (smoke:qc, typecheck, build, and format) through the
  same presenter the project History uses, so the two cannot drift. Runs that predate the local
  iteration ledger, runs with no recorded checks, and a failed metadata request each read
  differently instead of collapsing into one blank state.
- **Run safety.** A live feature lease protects its record from concurrent deletion or
  consolidation; if a record still vanishes, the owning run finalizes its evidence and reselects
  work. Detached-run teardown protects its own process tree and rejects a parent link whose child
  predates it, so a recycled process id is never mistaken for a run to reap. A batch audit's
  reports survive the CLI dying in the seconds after it emits them: recovery writes through the
  same path the CLI uses and still validates whole reports.
- **Fleet Director.** A profile, on-demand and scheduled cycles, ranked suggestions, and a
  tool-calling chat agent. Each suggestion keeps the rank its cycle assigned, so the list reads in
  the order the Director chose rather than in whatever order rows happened to be written, and a
  suggestion with no rank sorts last instead of showing a zero. The Director can launch the
  suggestions an automatic cycle just produced, off by default and bounded by rank, risk level, a
  per-cycle ceiling, an allow-list of the recipes it may start, and one suggestion per project per
  cycle, with a busy or dirty working tree standing a project down. The allow-list holds `coding`,
  `remediate-bugs`, and `remediate-audit-findings` by default, each of which takes one named
  artifact and finishes; anything else is left for a person to launch, and so is a recipe name that
  matches nothing. Setting it empty keeps auto-launch to plain runs. A project counts as busy for as
  long as a recipe-backed session lives, the ceiling counts launches that actually started, and
  bounds are evaluated before any launch is attempted. Each cycle records what it launched and what
  it passed over, with a reason for each, shown on the cycle in Recent Cycles with every entry
  linking to the run or pipeline session it started.
- **Scheduled tasks.** Durable local cadence for recipes, skills, audits, and Director cycles, with
  catch-up sweeps, Run now, and per-occurrence outcomes. Persisted scheduled-execution and
  Director-suggestion values are guarded by named database checks.
- **Audits.** Built-in security, architecture, performance, and other audits whose findings flow
  into the backlog with stable fingerprints and an append-only lifecycle ledger. Operators can
  dismiss a finding with a reason, record remediation and recurrence, and compare audits by
  acceptance, recurrence, revert rate, and cost per accepted finding. Outcome accounting assigns
  one terminal bucket per fingerprint, attributes bundled-run cost, bounds recurrence, reports
  degraded ledger coverage, and checks reverted commits incrementally per project. Audit evaluation
  has a planted-defect harness with locality-aware scoring, reproducible attestations, and
  precision and recall floors. The WATERMARK audit checks repositories for hidden provenance,
  credential-like artifacts, and suspicious text or media markers.
- **Recipes and pipelines.** File-backed recipes with `aidd-cli`, `skill`, `shell`, and
  `recipe-ref` steps, runnable from the panel or the CLI. Recipe names are unique, nested recipes
  resume after the web panel restarts, and each pipeline session has an exact per-session metrics
  path under `.aidd/runtime` with a bounded lifetime and a reserved `sessionMetricsPath`
  parameter, so concurrent pipelines never read each other's reports. Each attempt at a step is
  persisted separately, so a retried step reports the failure that provoked the retry alongside the
  attempt that succeeded, and an auto-fix run is recorded as the attempt it followed. The bundled
  catalog includes a frontend-polish recipe that chains desktop and mobile sweeps, remediation,
  testing, and release documentation. The template-maintenance recipes take a required `bumpHint`
  so the version step is deterministic rather than inferred, and they refuse to run when the target
  project is the template they propagate from.
- **Skills.** A bundled Agent Skills catalog with categories, managed imports, support files, and
  one-shot invocation. A skill package created or edited by an aidd skill also maintains its
  `agents/openai.yaml` presentation metadata, and packages written before that rule keep working
  without it; the pointme skill turns a stated goal into one or two exact skill or recipe
  invocations.
- **Telemetry.** Local invocation telemetry that compares skill revisions by outcomes, duration,
  tokens, and revert rate, with a usage dashboard. Web vitals are attributed to the route a metric
  belongs to, a layout shift records the element that moved, and a burst of invalidations from a
  fleet-wide fan-out collapses into one refetch per query key. Cost is aggregated by project on the
  server across the whole selected window, not summed from the visible rows of the Recent
  invocations table, and a project with invocations but no reported cost shows its coverage as
  unavailable rather than as $0.00.
- **Feature records.** `notes` on a feature record survives an append whether it is missing, a
  string, or an array, and readers accept both persisted shapes.
- **Remote control.** An MCP server for MCP-capable agents and a Telegram bridge for the phone.
- **Quality gates.** Web smoke assertions follow explicit label and control associations, persist
  page assertion failures in the structured report, and return one verdict across the process
  exit, JSON, and Markdown outputs. Startup, build, lint, dependency, and artifact gates report
  their real failures with diagnostics intact. The test runner isolates process-, socket-, and
  global-state tests from the parallel pool, watches for stalled phases, and keys cached quality
  steps on the inputs they actually read.

- **Content rails.** A page declares how wide its content should be instead of every surface
  deciding for itself: 80rem for workflow pages, 61rem for long-form reading, and full width for
  catalogs and data tables. Page headers, filter toolbars, commit bars, and cards read that
  declaration rather than carrying their own.
- **Phone commit bars.** Editor surfaces pin Save and Discard to the foot of the viewport on a
  phone, so a long form no longer leaves the control that commits it above the fold.
- **Filter counts.** A filter toolbar says how many filters are in force, and a surface with
  nothing to filter no longer opens an empty filters dialog.

### Changed

- **Release evidence.** Each screenshot attempt has its own directory. The tag guard requires a
  successful full crawl and analyzer result at 2250×1309, bound to the tagged commit, clean source
  tree, production build, route contract, and exact image inventory. Partial diagnostics cannot
  replace the full attempt, and old or changed evidence cannot authorize a new tag. Release
  instructions use the canonical full-suite test command and require a rebuild and fresh capture
  after constructing the first public source root.
- **Desktop reading.** Table headings stay above pinned identity columns, audit navigation restores
  catalog context, and run names retain the available width. Definition lists, reports, interview
  prompts, Director chat, profile labels, scheduled occurrences, and approval descriptions give
  their content room to read. Diary days share column tracks, and About retains its full prose.
- **Pipeline headings.** The Steps collection uses a section caption while individual steps keep
  readable titles and semantic nesting. A single step hides its repeated recipe name only when the
  names match; a distinct step name remains visible even when duplicate timing details are hidden.
- **Configuration contract.** Removed the unused `initModel` / `--init-model` surface and the
  persisted-but-never-executed `web.templates[].validationCommand` field before the first public
  tag. The exhaustive example now contains only accepted keys, and the configuration reference's
  complete Default column is checked against the runtime defaults rather than treated as
  unverified prose.
- **Startup weight.** The control panel's first paint loads about 162 KB of gzip-compressed
  JavaScript and CSS instead of 226 KB, under the 170 KB ceiling the performance audit sets. The
  project report dialog, launched-run toasts, the command palette, and the confirmation dialog are
  mounted the first time they are needed rather than with the shell, and the critical-path gate
  enforces the gzip ceiling directly while ratcheting its brotli figure downward on every pass.
- **Dashboard payload.** The dashboard reads one summary endpoint
  (`GET /api/v1/projects/dashboard-summary`) shaped for its cards instead of the full project
  list, which brings the initial fleet payload under the 1 MB page-weight budget. A launch or run
  that changes a project's state refreshes the summary along with the list.
- **Web vitals.** The System Metrics page and the web crawl report the 75th percentile of each
  metric, and every crawl report names the build it measured, so a report taken against a bundle
  other than the one on disk is refused instead of read as a pass.
- **Bundle analysis.** `bun run build:analyze` writes a chunk composition report under
  `data/build-analysis/`, and `check:bundle-analysis` runs as the last smoke:qc step. The report
  carries a hash of the assets it measured, so one left over from another build of the same
  revision, or from a `frontend/dist` rebuilt afterwards, is refused instead of read as current.
- **Source install.** `bun install` builds the control panel after installing dependencies when
  the frontend sources are present and `frontend/dist` is missing or stale, so a fresh clone can
  start the panel without a separate build step. `AIDD_SKIP_POSTINSTALL_BUILD=1` skips it. Source
  archives carry the commit they were cut from, so the build works outside a Git checkout, and the
  release workflow installs an export of the tag for real rather than trusting a stubbed build.
- **Web backend logs.** The detached backend's log files rotate at 10 MiB and keep five archives.
- **Run admission.** A run that writes to a project checkout (coding, interview, todo,
  triumvirate, and a directive that is not read-only) is admitted only when no other run is live in
  that checkout, whatever the configured per-project ceiling; worktree-isolated and read-only runs
  keep the configured concurrency. The ceiling is reserved before the run process starts and
  released if the spawn fails, so a rejected launch can no longer leave an untracked process
  behind.
- **Director identity.** Suggestions and prioritized work name a project by its route identity
  rather than its folder name, so two checkouts that share a basename cannot be confused, and a
  suggestion whose project is ambiguous stays pending rather than launching against either.
- **Audit profiles.** A profile rule may match on `derivesFromTemplate`, `hasCliBinary`,
  `publishesReleaseArchives`, and `shipsContainerImage`; those facets were accepted by the
  schema but ignored at match time.
- **Pending states** use a real ellipsis character, and image previews declare their intrinsic
  dimensions so the layout does not shift when they load.
- **Recipes and pipeline visibility.** A step's hooks, conditions, and full execution policy are
  shown on the read view instead of only in the editor, step conditions persist through a save,
  and a recipe that would form a cycle is rejected before it is written rather than at run time. A
  step name that is not yet valid reports its error when the field is interacted with, not while
  it is being typed. The recipe catalog describes mixed-step recipes for what they contain, and
  the creation hint points at the root catalog. Nested pipeline steps state their hierarchy, and
  pipeline progress counts only steps that actually completed.
- **Retried steps across a restart.** A step's retry phase and attempt ordinal are persisted, so a
  web restart in the middle of a retry resumes the same attempt sequence instead of restarting the
  count. A retried step stays in flight across the restart rather than being resolved from the
  first attempt it can find.
- **Settings validation.** Application roots are rejected before Save when they are blank,
  relative, missing, unreadable, or not a directory, with the offending root and the reason shown.
  Provider base URLs are validated for scheme. Changing a listener setting says plainly that a
  restart is required. Drafts survive a tab switch, and navigating away discards a draft instead of
  silently carrying it to the next screen.
- **Interviews and notes.** An interview draft survives a tab switch, a legacy responses file with
  linked answers parses as its real answers rather than as zero, and the project notes editor
  reports its length limit before the write is refused.
- **Timestamps and units.** Dated values render in the timezone their source recorded rather than
  being reinterpreted by the viewer's locale, same-day diary releases order by their recorded
  sequence, and Bun heap size and capacity are read from JavaScriptCore as one validated pair, with
  an explicit unavailable state rather than a plausible-looking zero.
- **Telemetry links and shares.** A telemetry link keeps the resource id it was built from, a
  retired resource is named without being linked to a page that no longer exists, invocation
  percentages reconcile against their own total, scheduled invocations record the source that
  actually started them, and the agent-output charts share one scale so two panels can be compared
  by eye.
- **Director accuracy.** Only a pending suggestion can be dismissed; a dismissal of one that has
  moved on reports a conflict rather than appearing to succeed, and only pending suggestions count
  as open while a launched suggestion keeps its output link. The Director's file tools resolve a
  project by its route identity rather than by a name that may be ambiguous, and the Director
  surface reserves its hydration geometry so the panel does not jump as it loads.
- **Audits.** A health figure with no denominator reads as unmeasured rather than as zero, an
  audit's existing reports are retained while it is disabled, and the shared disabled-state help
  explains why a control is unavailable.
- **Projects.** A move is guarded before it is performed, deleting a project requires reconfirming
  the delete mode, and local run history shows its capped subset against the lifetime total and
  agrees with finalized run accounting. The language count covers the whole repository while the
  list states its six-row display limit. Feature launch eligibility is shared between the Features and Dependencies
  surfaces, so an ineligible launch is guarded on both. A saved profile refreshes the listings that
  depend on it, and project tables reach every column on a phone.
- **Skills and documentation.** A skill description over the catalog's length limit is refused at
  write time, bundled skills show the source path they were installed from, the skills catalog
  returns to the position it was left at on mobile, and the in-app documentation distinguishes its
  current navigation axes. Release documentation records the source install lifecycle, and release
  notes may not claim live-backend coverage that no run proved.
- **Design system.** Semantic tone is hierarchical and a kind badge never asserts a status;
  typography follows one identity contract, and a badge in a constrained row keeps its identity
  rather than truncating to an ambiguous stub. Page rails are governed by content type, card
  headers separate status from commands, filter toolbars place their readout consistently and are
  responsive by default rather than by opt-in, tables measure to intrinsic width instead of a fixed
  cap that clipped columns, dropdown menus render on an opaque panel, page header actions align to
  the title, shared primitives keep their accessible roles and names, tooltip disclosures are
  reachable from every input, and an unbreakable machine string is contained by a character-level
  break rule instead of escaping its container. Markdown rendering is controlled by named modes
  rather than boolean flags.
- **Touch and pointer.** Coarse-pointer affordances are provided where hover was the only route to
  information, mobile touch targets no longer collide or satisfy their size on one axis only, the
  data-freshness readout stays inside the mobile viewport, maturity descriptions wrap, the sidebar's
  active destination stays clear of its edge mask, and the terminal's mobile tab controls remain
  usable. The terminal resends its geometry when its socket opens.
- **Roadmap grading.** The milestones callout no longer adds two different counts together into one
  blocking figure. Unmapped feature directories stay blocking, because they stop every coding run;
  a cross-milestone dependency violation is graded by whether its feature is finished, reading as
  unreachable when work would genuinely be stranded and as out of order when it would not.
- **Metadata writes.** Runtime writers preserve the on-disk formatting of tracked JSON, so a
  metadata update does not rewrite a file the repository formats.
- **Health endpoint.** `GET /api/v1/health` answers `{ status: 'ok' }` behind the same request-id,
  security-header, data-trace, access-token, and remote-origin plugins as every other route. The
  deployment health check, the web smoke lifecycle, and the MCP client's startup probe all use it.

- **Empty regions.** An empty list now says which kind of nothing it is: nothing exists yet, a
  filter matched nothing, or the request failed. All three used to render the same sentence.
- **Card structure.** Cards route their content through named slots instead of hand-rolled
  markup, heading ranks stop colliding inside a card, and the accent-filled button variant is
  documented as the one action a surface exists to complete.
- **Phone density.** Interactive controls carry a 44px floor, tab strips that used to wrap
  collapse into a compact select, and container-query steps are set to the width the content
  actually needs rather than a round number. End alignment now drops at the point the layout
  changes axis, so a control is never stranded against the right edge of a row it has to itself.
- **Number fields.** Recipe and settings number inputs use a stepper with real buttons rather
  than the browser native spinner, which cannot be hit at phone width.
- **Reading measure.** The 46-character prose measure is opt-in, so a markdown block inside a
  wide row takes the row instead of projecting a narrow reading column across it.

- **API compression.** Large JSON API responses negotiate their own encoding and send
  `Vary: Accept-Encoding`, so a big projects or runs payload arrives compressed rather than raw.
  Small responses stay uncompressed.
- **Fleet Git status.** Status for every project is collected with bounded subprocess concurrency,
  a per-command timeout, and a short single-flight cache, instead of one Git process per project on
  every request.
- **Projects list payload.** The projects collection no longer carries a per-feature status array
  that no list consumer read. Project detail still returns it where it is used, and the project
  pickers ask for names and paths only.
- **Activity badges.** The navbar pipeline badge reads a dedicated active-count endpoint at the
  shared activity cadence instead of downloading a full session page to compute one number.
- **Quality gate ordering.** Checks that fail often run before slow checks that rarely do, the run
  reports a cold-run time projection before it starts, and the workspace lint invocations run
  concurrently rather than one after another.
- **Database constraints.** Every column holding serialized JSON has a named `json_valid` check,
  the closed enum columns have named domain checks, and foreign keys are named rather than
  anonymous, so schema parity can compare them against a fresh database. Migrations apply one
  prepared statement at a time, so a constraint failure partway through a file cannot pass unnoticed.
- **CI evidence.** A failed browser smoke run keeps its crawl, analyzer, backend, and detached
  process logs as downloadable artifacts, and successful crawl output is retained so Web Vitals can
  be compared across runs.
- **Coverage floors.** Frontend module and scripts line floors were raised to the levels actually
  measured, and the gate warns when a floor drifts more than six points below measurement.

### Fixed

- Application-root validation waits for the current form values to settle, avoiding requests for
  the previous blank or edited roots. Save errors name the Settings tab that needs attention.
- Provider credentials distinguish keeping, replacing, and clearing a saved key. Clear and Undo
  are explicit actions, and removing an unsaved replacement keeps the stored key.
- Project creation explains required descriptions immediately but waits until the field has been
  left before showing its error. Intake filters and backend timeout fields fit their available
  width. A successfully loaded empty fleet clears stale root filters without treating loading as
  an empty result.
- Artifact totals and health exclude records marked not applicable from missing counts and use
  the same classification as the inventory rows.
- Phone Save and Discard controls remain reachable across editors, including both Settings and
  its independently saved Director Profile. Documentation outlines remain reachable at narrow
  widths, dependency graphs use the available viewport, and long identifiers stay inside grids.
- Browser crawl checks select the visible responsive feature filters, so a hidden desktop or phone
  copy cannot cause an otherwise usable page to fail its assertions.
- The bundled Vite template runs `create-vite` from the target directory against `.`, avoiding the
  mangled directory name produced when create-vite receives an absolute Windows path.
- A completed automatic Director cycle records its auto-launch decision in the database before
  any launch, so a web restart in the middle of that decision resumes it once instead of losing
  it or repeating it.
- The queries the control panel refreshes after a socket reconnect are derived from the same table
  the live event handler reads, so a query a live event refreshes cannot be skipped after a
  reconnect; `run-output` and the Director fleet summary were.
- Multi-line interview answers written from the panel survive the round trip through
  `.aidd/responses.md` intact instead of keeping only their first line.
- The run console disclosure and the scheduled task form's unsaved-changes state are derived from
  their inputs instead of mirrored through effects, and every core list query shares the retry
  policy that stops retrying on a 4xx response.
- The shared project instructions file no longer trips the self-contained source release gate.
- A path outside the configured allowed roots answers with a validation status instead of a 500,
  at every call site rather than at the ones that wrapped the check by hand, and the project
  create lane stops offering a spec path the server will refuse.
- A heartbeat-reaped run reports that it was reaped instead of showing an undecoded `Exit -1`
  sentinel, while genuine non-zero exit codes are still decoded and shown as before.
- Diary run rows classify their outcome through the same shared classifier as the Runs page and
  project history, from the run's authoritative status, stop reason, exit code, and summary, rather
  than rendering the raw database status.
- The project history stops offering a link for a CLI-only run that has no page to open, a
  rejected launch leaves no partial transcript behind, and the runs surface explains when output
  is unavailable rather than presenting an empty console as a completed one. Run history summaries
  are given the width they need before the columns beside them.
- Recipe execution intent has a single writer, so the panel and the runtime cannot record
  different intents for one step.
- Data-trace string previews are scrubbed for secrets across the whole value before truncation,
  and projected identifiers are scrubbed before entering the trace header.
- The remote-access warning describes a remote listener as token-protected rather than as open.

- The settings tabs report save state in words a person can read, rather than printing an
  internal query key where the status line goes.
- The execution-identity badge lab measures the element the text actually overflows, so its
  clipped verdict can fire instead of always reporting a fit.
- Diary rows no longer paint a status badge over the entry title.
- Each sortable header on the audits catalog sorts the column it labels, and the applicability
  legend renders on the page instead of hiding inside a filters dialog.
- A resumed pipeline session rehydrates its root invocation before running a step, so nested
  telemetry rows record a parent invocation alongside the parent resource they already wrote.
- Surfaces that read live data fail visibly rather than quietly: the dashboard project metric
  says when its request failed instead of reporting zero, the terminal distinguishes an
  unreachable service from an idle one, a run project selector keeps a value that is not in its
  option list, a saved filter value is normalized when it is stored rather than when it is read,
  a scheduled task states when its scope and target cannot be combined, and the raw JSON view of
  a feature shows the keys the record actually holds.

- Stopping one run stops only that run. The signal is run-scoped, the explicit project-wide stop is
  still available, and a run that loses the race to finish is no longer recorded as completed by a
  sibling.
- Startup recovery contains failure per Director cycle. A cycle that cannot advance is failed and
  reported on its own instead of stopping backend startup or holding the idle gate.
- Process termination on Linux and macOS enumerates a run's actual descendants rather than assuming
  they share a killable process group, so the quality gate can finish on the platform CI runs it on.
- Installing the package fails when Git hook installation fails, rather than reporting success with
  no hooks in place.
- Static responses prefer Brotli at the level the critical-path budget was recorded against when the
  client rates encodings equally.
- The project detail browser chunk no longer pulls validation schemas in through the shared feature
  barrel.
- The GitHub Pages deployment job has a 10-minute timeout.
- Diary timeline columns come from one shared model used by both the grid and the row cells, so a
  new filter or column cannot leave the two disagreeing.

### Security

- Launch-context probes apply the outbound request guard immediately before fetching, including
  alternate encodings of cloud metadata endpoints.
- Telegram and channel transports reject redirects, validate every constructed URL, and apply
  finite request bounds.
- Vulnerable dependency resolutions were upgraded and temporary overrides removed once the normal
  dependency graph supplied the fixes. Hosted CI runs Bun's dependency audit, and
  distributed media is scanned for C2PA and JUMBF markers. The source-release license inventory
  classifies every bundled Spernakit Dance reference file.

- The native agent's shell tool checks command text and recognized path arguments and destinations,
  rejecting detected escapes through relative segments or symlinks.
  Variables are judged by value rather than spelling: a reference the command itself sets is
  expanded before the check, `$PWD` counts as the project root, a reference to anything else
  (`$TEMP`, `$SystemRoot`) is refused because its value cannot be seen, and the rewrites only
  bash can perform (brace expansion, `${...}` operations, `$'...'` quoting, `read`, dot-globs)
  are refused outright.
  **Accepted limitation on Windows:** this is lexical enforcement, not an operating-system
  filesystem sandbox. An invoked interpreter can construct paths at runtime, read outside the
  workspace, and access the inherited home directory. The interpreter escape remains unresolved;
  the risk is accepted, not fixed or dismissed. Recipe shell steps separately validate their
  starting directory against `allowedRoots`; external backend CLIs use their own permission
  controls. Neither inherits the native agent's shell policy.
- Provider API keys stay bound to their own provider: `OPENAI_API_KEY`, `ZHIPU_API_KEY`, and
  `XAI_API_KEY` are each read only when that provider is selected, and `NATIVE_API_KEY` is the
  only provider-agnostic override.
- Media under the GitHub Pages site passes through the same provenance scan as the rest of the
  distributed media.

- Operator credentials live in the environment rather than in `~/.aidd/config.json`. The control
  panel token and the Telegram bot token are read from `AIDD_WEB_AUTH_TOKEN` and
  `AIDD_TELEGRAM_BOT_TOKEN`, the environment beats any value still on disk, and saving settings
  never writes an environment value back to the file. Provider keys keep their existing
  per-provider variables. A credential that is not in a file cannot be returned by a tool that reads
  that file, which is the only point where redaction is not already too late.
- A control panel bound to the network must have a token. The backend refuses to start with
  `web.allowRemote` set and no `web.authToken`, and if such a configuration reaches the request
  guard by another route the panel answers loopback callers only. Reverse-proxied requests always
  need the token, whichever interface the panel is bound to.
- Log redaction covers the forms a credential actually takes in a transcript: different casing,
  environment-style assignments, escaped JSON, nested objects, and a value split across streamed
  chunks. The iteration writer, WebSocket hub, log cleaner, and final JSON output share one policy,
  and structured fields are redacted at every depth.
- A `check:credential-disclosure` gate reads retained run artifacts for the shape of a tool that
  opened a credential store and got content back. It matches on shape alone and never reads, prints,
  or hashes a value. An accepted entry needs a stated reason, and the accepted list can only shrink.
- Project configuration is untrusted for credential routing. A repository cannot replace provider
  definitions, choose the operator's provider, or point Direct AI at another endpoint while
  inheriting the operator's key. Model and surface overrides still work.
- The audit name accepted at launch is checked against the catalog before any file is read, at both
  the command line and the HTTP boundary, so it cannot walk out of the catalog directory.
- Buffered provider responses are bounded while they are read and cancelled at 24,000,000 bytes,
  matching the streaming path. The outbound guard also blocks the AWS ECS and EKS credential
  addresses and bare metadata shorthand.
- Retained data has bounds. Terminal transcripts expire after 90 days within a 1 GiB cap and
  terminal execution history after 365 days, and cleanup never touches an active run. Detached
  backend logs rotate at 10 MiB during service lifetime, keep five archives, and prune archives
  older than 30 days at startup.

### Licensing and distribution

- aidd is released under FSL-1.1-ALv2 and converts to Apache-2.0 two years after publication. Every
  capability is included under the FSL terms, including scheduled fleet automation, Director
  autopilot, continuous follow-ups, Telegram, and every MCP tool.
- Releases are source-only. A tagged source release follows successful CI and publishes notes
  generated from this changelog; GitHub produces the source archives from the tag itself. There
  are no prebuilt binaries, container images, or checksum bundles, and Bun 1.4.2 or newer is the
  only runtime requirement.
- The product site is the repository's GitHub Pages site at
  [nomadicdaddy.github.io/aidd](https://nomadicdaddy.github.io/aidd/).
