// The questions path is parameterized because `--interview FILE` can resolve the target
// somewhere other than the default .aidd/questions.md — a directive hardcoding the default
// would contradict where the mode actually checks for the file.
export function buildGenerateQuestionsDirective(relativeQuestionsFile: string): string {
	return `Generate an interview questions file for this project.

Read the codebase and project metadata (especially .aidd/spec.md,
.aidd/project-structure.md, and any existing .aidd/ artifacts) to understand the
project's purpose, architecture, and current state. Then write ${relativeQuestionsFile}
with structured interview questions that will help a human operator clarify project
intent, confirm architecture decisions, and identify gaps in the current .aidd/
metadata.

Use markdown headings (## ) for each question section. Each section heading should
contain a question mark. Group questions by topic area. Include questions about:
- Product intent and target users
- Architecture and technology choices
- Data model and storage decisions
- Authentication and authorization approach
- Deployment and operations
- Testing strategy and quality gates
- Known risks or open decisions

Skip any section whose heading is "Legend" or "Summary" — those are scaffolding,
not questions. Write nothing outside .aidd/. Do not modify any existing files except
to create or update ${relativeQuestionsFile}.`;
}

// Escalation wrapper for retries after an iteration ended cleanly without creating the
// questions file (observed: an agent that spent every attempt answering the project's open
// questions into .aidd/responses/ instead, 30 times in a row). Leads with the single
// deliverable and the exact path before restating the base directive.
export function buildGenerateQuestionsRetryDirective(
	questionsFile: string,
	relativeQuestionsFile: string,
	failedAttempts: number
): string {
	return `## RETRY ${failedAttempts + 1}: the interview questions file was NOT created

Your previous attempt(s) finished without creating a valid questions file. This iteration
has exactly one deliverable: that file must exist, with at least one question, when you
finish.

- Create it at the relative path ${relativeQuestionsFile} from the project root
  (absolute target: ${questionsFile}). Do not use /mnt/... or any other rewritten path form.
- Do NOT write answers, analysis, or anything under .aidd/responses/ — this step only
  GENERATES questions; answering happens in later iterations.
- Use markdown "## " section headings whose titles contain a question mark.
- Before finishing, read ${relativeQuestionsFile} back to confirm it exists and contains
  your questions.

${buildGenerateQuestionsDirective(relativeQuestionsFile)}`;
}
