# Profile Matrix

Profile Matrix compares the assurance posture and audit applicability of every managed project.
Use the summary view to scan posture, applicable audits, profile source, and last update. Filters
narrow the fleet without changing any project.

## Assurance facets

Each project profile records ten facets such as deployment reach, data sensitivity, authentication,
and regulatory exposure. **Bucket** is the resulting assurance category: aidd derives it from the
facet combination and uses it to choose which audits are required, optional, or excluded. Posture
and audit counts are previews of that calculation, not independent settings.

## Editing profiles

Switch to **Edit facets** to change profile inputs. On phones, open **Edit facets** on one project
card at a time; opening another card closes the previous editor. On wide screens, use the column
chooser to limit the editable facet columns.

Changes immediately recalculate the posture and audit preview but remain local until saved. An
**Unsaved** badge marks changed projects. Use the row's Save or Reset action, or **Save all changed**
when several projects are ready. Reset restores the last saved profile.
