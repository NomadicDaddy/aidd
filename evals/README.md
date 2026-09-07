# Evaluation suites

`evals/` contains committed, repeatable quality measurements for aidd's own agent-facing
contracts. Generated run results and disposable workspaces are local artifacts; manifests,
fixtures, and attestations are source-controlled.

## Audit evaluations

`audits/manifest.json` catalogs planted defects and benign decoys. Each site identifies its audit,
fixture file, symbol or line, severity, and matching aliases. The scorer requires both a catalog
alias and the expected file, preventing an unrelated mention from receiving credit.

```powershell
bun run bench:audits
bun run check:audit-evals
bun run test:audit-evals
```

- `bench:audits` runs the model-backed matrix and refreshes `audits/attestation.json`.
- `check:audit-evals` validates the catalog and fixture locations, checks every runnable audit
  definition hash, and enforces the attested precision and recall floors without model calls.
- `test:audit-evals` proves the executable gate rejects a missed planted defect and a flagged decoy.

Run artifacts live under `audits/results/` and disposable projects under `audits/workspaces/`; both
are ignored by Git.
