# Director

The **Director** is aidd's fleet-level advisor. It looks across all of your projects, produces recommendations, and can orchestrate work on your behalf.

## Cycles and suggestions

Run a **cycle** to have the Director analyze the fleet, optionally with a directive that focuses the analysis. A cycle produces **suggestions** without editing project trees itself:

- **Project-scoped** suggestions launch their named recipe as a pipeline session. Suggestions without a recipe launch a supervised run.
- **Fleet-wide** suggestions are advisory: they give direction but aren't launchable on their own.

Dismiss a pending suggestion when you decide not to launch it, or after handling fleet-wide guidance. A completed cycle retires any still-actionable suggestions from older cycles before inserting its own.

Cycles can also start automatically from a built-in task on the **Scheduled** page called Director fleet cycle. The task is paused by default. Change its cadence, pause it, or resume it there; the Director page and Settings show its current state and link to it. Only one cycle runs at a time, so starting one by hand while another is running is refused, and an automatic occurrence that arrives during a cycle is recorded as skipped.

**Suggestion Auto-Launch** is a separate, off-by-default setting. When enabled, a cycle started by an automatic scheduled occurrence can launch eligible suggestions as soon as the cycle completes; manual cycles, including **Run now**, never auto-launch. Configured limits bound unattended launches by cycle count, suggestion rank and risk, recipe allow-list, project availability, active work, and working-tree state, with at most one launch per project in a cycle. Recent Cycles records what was launched and why other suggestions were skipped.

## Director chat

The chat is a persisted conversation with the Director that runs as an autonomous tool-calling agent. Within a turn it can inspect the fleet and orchestrate work: launch and inspect runs, stop or kill active runs, start cycles, and act on suggestions.

Chats persist as separate conversations. Start one with **New chat**, switch between them in the **Chats** rail, or delete one to discard it and its message history.

The Director receives the current recipe catalog and can inspect a recipe's exact steps before explaining or launching it. Recipe names are not treated as behavioral documentation.

By default the chat does not edit project files itself; changes flow through supervised runs. An opt-in setting allows direct project file and shell access if you want it. When no compatible tool-calling provider is configured, the chat falls back to a read-only, text-only reply.

## Director profile

The Director's behavior (CLI, model, reasoning effort, role, and instructions) comes from the **Director profile**, configured separately from any project's profile.
