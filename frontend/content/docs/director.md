# Director

The **Director** is aidd's fleet-level advisor. It looks across all of your
projects, produces recommendations, and can orchestrate work on your behalf.

## Cycles and suggestions

Run a **cycle** to have the Director analyze the fleet. A cycle produces
**suggestions**:

- **Project-scoped** suggestions launch their named recipe as a pipeline session. Suggestions
  without a recipe launch a supervised run.
- **Fleet-wide** suggestions are advisory: they give direction but aren't
  launchable on their own.

Handled suggestions can be dismissed so the list stays focused on what's still
open.

## Director chat

The chat is a persisted conversation with the Director that runs as an
autonomous tool-calling agent. Within a turn it can inspect the fleet and
orchestrate work: launch runs, start cycles, and act on suggestions.

The Director receives the current recipe catalog and can inspect a recipe's exact
steps before explaining or launching it. Recipe names are not treated as behavioral
documentation.

By default the chat does not edit project files itself; changes flow through
supervised runs. An opt-in setting allows direct file edits if you want it.
When no compatible tool-calling provider is configured, the chat falls back to
a read-only, text-only reply.

## Director profile

The Director's behavior (CLI, model, reasoning effort, role, and instructions)
comes from the **Director profile**, configured separately from any project's
profile.
