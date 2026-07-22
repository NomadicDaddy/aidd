# Interview Mode

Interview mode walks a project through a sequence of questions, recording one answer at a
time into project metadata. It is how aidd gathers the human context it cannot infer from
code (product intent, constraints, priorities) to seed the spec and feature backlog. It can
be driven from the CLI or from the **Interview** tab on a project's detail page.

## Files

| Path                           | Role                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `.aidd/questions.md`           | The question set. Parsed from `## ` headings or `- **[PRIORITY]** prompt` list items. |
| `.aidd/responses/responseN.md` | One file per answered question.                                                       |
| `.aidd/responses.md`           | Progress index correlating questions to their answers.                                |

A question counts as answered once its response file exists.

## CLI

Interview mode selects the first **unanswered** question as the run's work, prompts the
backend, and writes the result back:

```powershell
bun run start -- --project-dir C:\path\to\my-app --interview
```

Run it repeatedly to advance through the question set. Each run answers the next open
question and updates `.aidd/responses.md` (`cli/src/modes/interview.ts`).

## Web

The project detail **Interview** tab (`frontend/src/pages/projects/detail/InterviewTab.tsx`)
shows progress (total / answered / unanswered), lists open questions with a text box each,
and renders answered questions read-only. Submitting an answer records it immediately.

API (`backend/src/routes/projects.ts`, served by
`backend/src/services/interviewService.ts`):

| Endpoint                                        | Purpose                                   |
| ----------------------------------------------- | ----------------------------------------- |
| `GET /api/v1/projects/:id/interview`            | Progress + answered/unanswered questions. |
| `POST /api/v1/projects/:id/interview/responses` | Submit `{ questionId, answer }`.          |

The response payload reports `answered`, `total`, `hasQuestionsFile`, and the resolved
question lists; each question carries an `id`, `priority`, and `prompt`.

## Relationship to onboarding

Interview answers feed the rebuild flow that (re)generates `.aidd/spec.md` and the feature
backlog. See [auto-rebuild.md](./auto-rebuild.md) and the `onboarding-interview` command.
