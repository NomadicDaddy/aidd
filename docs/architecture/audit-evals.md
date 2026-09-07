# Audit evaluation harness

The audit evaluation harness turns audit quality into a merge-blocking, reproducible contract. It
complements the general benchmark leaderboard: benchmark composite scores remain advisory, while
audit precision, recall, freshness, and definition hashes have explicit pass/fail floors.

## Data flow

`evals/audits/manifest.json` is both a benchmark manifest and the defect catalog. Each audit-eval
task names its audit definition, fixture, planted defects, and benign decoys. Every catalog site
must name a fixture file plus exactly one line or symbol, a severity, and one or more aliases.

The benchmark runner copies the fixture from the manifest's own directory, runs the selected audit,
and dispatches `evaluation: audit-eval` through `scripts/lib/benchmark/evaluation.ts`. The scorer
reads each generated audit Feature separately, and only its own words: the title, description,
notes, and `affectedFiles`. A finding's id and status are never part of the haystack, so a slug
that happens to contain an alias cannot score.

### Locality matching

A finding is credited for a site only when all three hold:

1. it names the cataloged file, in `affectedFiles` or in its text;
2. it points at the cataloged location: for a symbol site it names the symbol as a whole
   identifier (`health` does not match `healthy`), for a line site it cites a line, as
   `server.ts:12` or `line 12`, within `scoring.auditEval.lineTolerance` (default 3) of the
   cataloged line;
3. it uses one of the site's aliases.

Matching is evaluated per defect, so one consolidated finding that names two planted defects
credits both. Two findings on the same defect are both real catches.

### Decoy accounting

Every finding lands in exactly one bucket:

- **credited**: it matched at least one defect;
- **decoy**: it matched no defect but matched a decoy site. Decoy hits always count against
  precision, even when the report borrows a defect's vocabulary;
- **uncataloged**: it matched neither. These are listed in the run notes and reported in the
  attestation, and count against precision only when the manifest sets
  `scoring.auditEval.strictPrecision` to `true` (default `false`).

Precision is credited findings over credited plus spurious findings, where spurious means decoy hits
plus, under strict precision, uncataloged findings. Recall is matched defects over cataloged
defects. The run score is the manifest-weighted combination of the two. Structured detail
(credited, decoy, uncataloged, matched, missed, and spurious ids) is retained on each benchmark Run.

### Fixture metadata

The fixture's `.aidd/` directory is what the audited model reads as the project's source of truth,
so it must describe the project the way a real one would and nothing more. `check:audit-evals`
fails when any file under a fixture's `.aidd/` contains the token `decoy` or `eval`, case
insensitive.

## Floors

`evals/audits/floors.json` holds `minPrecision`, `minRecall`, and `minRuns` (default 3). They live
apart from the manifest so lowering a floor is a one-line diff on its own file, distinct from
regenerating the attestation. The attestation records the floors it was generated under, and the
gate reports a row whose recorded floors differ from the file as stale.

## Attestation

`bun run bench:audits` writes ordinary benchmark outputs under the ignored
`evals/audits/results/` directory, then refreshes the committed
`evals/audits/attestation.json`. Only runs of the current fixture are attested. A run's
`fixtureHash` covers the fixture files and the task's defect catalog (`hashTaskFixture` in
`scripts/lib/benchmark/execution.ts`), so planting a file or editing an alias makes earlier runs
stale: the attestation skips them and reports how many, and the benchmark reruns a stale replicate
instead of resuming it. The attestation records:

- averaged precision and recall, the run count, and the uncataloged finding count per cataloged
  Audit;
- the floors in force when it was generated;
- the SHA-256 of the manifest;
- `resultsDigest`, the SHA-256 over the run records the rows were averaged from;
- the normalized definition hash of every runnable Audit, the same hash a run's `driverSha256`
  carries;
- the raw content hash of every file under `audits/`, including `AUDIT_METHODOLOGY.md`,
  `SEVERITY_CLASSIFICATION.md`, and `audit-profile-mapping.json`.

The command exits nonzero when any cataloged Audit has fewer than `minRuns` runs or falls below
either floor. A failing attestation is not written unless `--write-failing` is given, so the
committed file is always one that passed when it was recorded.

## Model-free gate

`bun run check:audit-evals` does not call a CLI, Provider, or Model. It validates the catalog against
the fixture tree and runnable Audit catalog, scans fixture metadata for answer disclosure, verifies
the attested manifest, definition, and file hashes, and enforces the floors. Its summary line names
the measured and unmeasured Audits apart, for example `1 of 43 audits measured, 46 audit files
hash-checked`. It is part of `smoke:qc`; cache inputs include the Audit catalog, committed eval
inputs, and scorer/checker sources, so any Audit definition or harness change re-runs the gate.

`bun run test:audit-evals` drives the real command against a scratch copy of the inputs
(`scripts/lib/audit-eval/self-test.ts`). It proves a perfect attestation passes and that too few
runs, a stale definition, a missed defect, and flagged decoys each make the gate red. It also plants
a decoy report that borrows a defect's vocabulary and a finding on the wrong symbol, and asserts
neither raises recall.

## Refresh procedure

1. Update the audit definition, fixture, catalog, floors, or scorer.
2. Run `bun run test:audit-evals` to prove the negative paths still fail.
3. Run `bun run bench:audits` with the configured model-backed stack; `scoredRepetitions` in the
   manifest must reach `minRuns`.
4. Review the per-finding Run notes and the changed attestation.
5. Run `bun run check:audit-evals`, then the normal quality gates.
