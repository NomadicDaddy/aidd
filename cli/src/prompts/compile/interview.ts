import type { PromptPlan } from 'aidd-shared/plan/types';

import { METADATA_DIR } from 'aidd-shared/metadata/paths';

import { normalizePromptPath, numberVariable, stringVariable } from './shared.ts';

export function compileInterviewPrompt(plan: PromptPlan): string {
	const questionNum = numberVariable(plan, 'interviewQuestionNumber', 1);
	const totalQuestions = numberVariable(plan, 'interviewTotalQuestions', 1);
	const questionText = stringVariable(plan, 'interviewQuestionText') ?? '';
	const metadataDir = normalizePromptPath(stringVariable(plan, 'metadataDir') ?? METADATA_DIR);
	const responsesDir = `${metadataDir}/responses`;
	const responseFile = `${responsesDir}/response${questionNum}.md`;

	return `## YOUR ROLE - INTERVIEW MODE (Codebase Q&A)

You are an AI assistant answering codebase questions in **Interview Mode**.
You are answering **Question ${questionNum} of ${totalQuestions}**.

### THE QUESTION

${questionText}

### YOUR TASK

1. **Read and understand the question above**
2. **Explore the codebase thoroughly** to gather all relevant information
3. **Write your response** to the file: \`${responseFile}\`

### RESPONSE FILE FORMAT

Write your response to \`${responseFile}\` using this format:

\`\`\`markdown
# Question ${questionNum}: [Question Title from heading]

## Question

[The full question text]

## Response

[Your detailed, thorough answer based on codebase analysis]
\`\`\`

### CRITICAL INSTRUCTIONS

- You MUST write your response to the exact file path: \`${responseFile}\`
- Create the directory \`${responsesDir}\` if it does not exist
- Base your answer on actual code, files, and configuration — not assumptions
- Be thorough and specific — reference file paths and code when relevant
- Do NOT modify any project code — this is a read-only analysis task
- Do NOT modify features, changelogs, or any other project metadata
- After writing the response file, summarize your answer briefly and exit

### ASSISTANT RULES

**STEP 0: Load project rules (if they exist):**

- Read \`AGENTS.md\` if it exists, otherwise try \`CLAUDE.md\` if it also exists
- Apply these rules throughout your work
- Assistant rules override generic instructions

### PROJECT CONTEXT

**Quick References:**

- **Spec (source of truth):** \`/.aidd/spec.md\`
- **Invariants to uphold:** \`/.aidd/assertions.md\`
- **Architecture map:** \`/.aidd/project-structure.md\`
- **Roadmap scope gate:** \`/.aidd/roadmap.json\`
- **Project assurance profile:** \`/.aidd/project-profile.json\`
- **Screen/route catalog:** \`/.aidd/screen-map.md\`
- **Testing scenarios:** \`/.aidd/testing-scenarios.md\`
- **Feature list:** \`/.aidd/features/*/feature.json\`
- **Changelog:** \`/.aidd/CHANGELOG.md\`
- **Project overrides (highest priority):** \`/.aidd/project.md\`
- **Interview context:** \`/.aidd/questions.md\`, \`/.aidd/responses.md\`, \`/.aidd/responses/\`

---

Begin by reading the codebase to answer the question, then write your response file.
`;
}
