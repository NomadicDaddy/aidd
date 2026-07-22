# Director

The Director is aidd's fleet-level control surface. The rest of aidd works on one project at
a time; the Director looks across every project under your allowed roots, summarizes their
health, proposes prioritized work as **suggestions**, and lets you drive the fleet through a
tool-calling **chat** agent. It lives on the `/director` page.

## Concepts

| Concept           | Meaning                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Profile**       | The Director's backend, model, reasoning effort, role, and instructions.                             |
| **Fleet summary** | An aggregated snapshot of project health, priority work, and audit findings.                         |
| **Cycle**         | A background run that builds the fleet summary, executes the Director prompt, and emits suggestions. |
| **Suggestion**    | A proposed unit of work (project-scoped or fleet-wide) you can launch or dismiss.                    |
| **Chat**          | A tool-calling agent session that can inspect the fleet and orchestrate supervised work.             |

The fleet summary's `featurePassRate` feeds the dashboard's "Priority Health" headline; see
[Dashboard Metrics](../reference/dashboard-metrics.md) for the definitions of record (and why
`fleetHealthScore` is diagnostic only).

## Tabs

The page (`frontend/src/pages/director/`) is organized into:

- **Profile**: edit and save the Director's `backend`, `model`, `reasoningEffort`,
  `role`, and free-text `instructions`. One profile record is persisted.
- **Cycles**: view recent cycles and watch an active cycle's stage and artifacts
  (fleet-summary, context, and output paths).
- **Suggestions**: the suggestions produced by cycles, each with **Launch** and **Dismiss**
  actions. A suggestion naming a recipe launches that exact recipe as a pipeline session;
  a free-form suggestion without a recipe launches a supervised run.
- **Chat**: sessions with the tool-calling agent.

## Chat agent

When the configured backend supports tool calling, chat runs an agent loop
(`backend/src/services/director/chatAgent.ts`) with orchestration tools:
`list_projects`, `get_project`, `get_fleet_summary`, `get_recipe`, `list_suggestions`, `get_run`,
`run_output`, `launch_run`, `stop_run`, `kill_run`, `launch_suggestion`,
`dismiss_suggestion`, and `run_cycle`. If the backend cannot call tools, chat falls back to
text-only replies. File edits from chat are gated behind the `director.chat.allowFileEdits`
config flag. Chat receives the recipe catalog and must inspect a recipe's exact definition
before it describes recipe behavior.

## API

`backend/src/routes/director.ts`:

| Endpoint                                         | Purpose                           |
| ------------------------------------------------ | --------------------------------- |
| `GET /api/v1/director/fleet`                     | Current fleet summary.            |
| `GET /api/v1/director/profile` · `PUT …/profile` | Read / update the profile.        |
| `GET /api/v1/director/cycles` · `POST …/cycles`  | List recent cycles / trigger one. |
| `GET /api/v1/director/suggestions`               | Active suggestions.               |
| `POST …/suggestions/:id/dismiss` · `…/launch`    | Dismiss or launch a suggestion.   |
| `GET/POST …/chat/sessions` · `…/:id/messages`    | Chat sessions and messages.       |

## State

Director state is in the web SQLite database (tables `directorProfiles`,
`directorCycles`, `directorChatSessions`, `directorChatMessages`, `suggestions`).
Cycles run in the background and write their artifacts to disk; the UI polls for progress.
Suggestions are not a separate execution engine. A recipe-backed suggestion records and links
its pipeline session; a suggestion without a recipe records and links its ordinary run.

## Typical use

1. Open **Profile**, choose a tool-calling backend and model, write fleet-level
   instructions, and save.
2. Trigger a **cycle** (or ask chat to `run_cycle`).
3. Review **Suggestions**; launch the ones worth doing, dismiss the rest.
4. Use **Chat** for ad-hoc fleet questions and to launch/stop runs conversationally.
