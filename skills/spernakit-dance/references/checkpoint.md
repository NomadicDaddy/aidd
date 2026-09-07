# Checkpoint Rules

Field-level rules for `<applications-root>/.dance-state.json`. The shape itself is in
`../state-schema.json`. Treat its declared top-level properties as the allowlist. No runtime
validator rejects extra fields, so an undeclared convenience field can survive a resume while still
violating the checkpoint contract.

`perApp` is the per-app record of record, keyed by app slug. Each entry carries `A`, `B`,
`D1_supertest`, and `D2_smokeqc` — each one `pending`, `ok`, `failed`, or `skipped` — plus
`D3_tagged` (the tag string written, or null) and `lastError`. Use those four status values and no
others: nothing validates this file, so an invented status such as `completed` survives into the next
resume and reads as neither done nor pending. There are no top-level `completed` or `failed` arrays.
Per-app outcomes go in `perApp`; use the schema's named top-level fields for their declared facts and
`notes` for other phase-wide evidence and owner decisions.

**A checkpoint helper writes only the fields it was asked to write.** Nothing validates this file. A
reusable note-appender that also carried a hardcoded `phase` write silently reset the phase after
Part C had closed it in the v3.43.3 dance, and the wrong value survived through all of Part D1.
Read, mutate the named fields, write back; never restate a field the caller did not name.
