# Single-user control panel, cut back from aidd-web

aidd's bundled web control panel deliberately serves a **single local operator** and omits the
multi-user `aidd-web` product surface: auth, RBAC, workspace/tenancy, notifications, analytics,
scheduling, and custom dashboards. We kept only the local control-plane workflows needed to operate
the runtime. The current visible sections are Dashboard, Projects, Director, Pipelines, Runs, Diary,
Recipes, Skills, Audits, Telemetry, Settings, Docs, and About (see
`frontend/src/components/layout/nav-items.ts` for the authoritative list).

> Historical note: earlier revisions of this panel exposed these pages under different names. The
> Director surface was the "Coordinator" page, the Skills catalog merged the former separate
> "Commands" and "Skills" pages, and "Pipelines" was previously labelled "Pipeline Sessions". Those
> retired labels are kept here only to explain the rename; they are not current navigation.

We chose this because aidd is an operator tool that runs on the owner's own machine against a
local fleet, where identity is the OS user and there are no other tenants to isolate. Carrying the
full hosted-product surface would add auth/tenancy complexity and attack surface for zero local
benefit. The cost of reversing this is meaningful (re-introducing auth, RBAC, and tenancy touches
every route, store, and page), and the omission is surprising to a reader who expects a web app to
have a login, so it is recorded here as a deliberate scope boundary.

Reintroducing any of the cut surfaces requires an explicit product decision, not an incidental
feature add. The loopback web API stays guard-light by design (loopback calls are exempt from the
optional bearer token), consistent with the single-operator assumption.
