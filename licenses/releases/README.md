# Release source records

Each distributed release carries a source record that maps every artifact SHA-256 to the exact
aidd commit, Bun tag, and dependency lockfile used to build it. This makes the corresponding-source
offer in [`../SOURCE-OFFER.md`](../SOURCE-OFFER.md) fulfillable for the artifact a recipient holds.

`bun run release:package` writes `source-record-vX.Y.Z.md` beside the release assets, and the
published release asset is the record of record. Nothing is written into this directory unless you
pass `--retain-record`, which is only correct when you are hand-distributing the zip your own
machine just built. A local build and the published build produce different archives with different
hashes, so a record retained from a routine local packaging run describes bytes no recipient holds.

Retain each source record and its referenced sources for at least three years after the last
distribution of the corresponding artifacts. Private retention procedures belong outside the
public repository.
