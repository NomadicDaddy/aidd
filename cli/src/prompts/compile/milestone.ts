export function compileMilestone(value: string, featureDirectories: string[]): string {
	const list = featureDirectories.map((feature) => `- ${feature}`).join('\n');
	return `## MILESTONE FILTER (applied via --milestone ${value})

**CRITICAL: You MUST only work on features belonging to the \`${value}\` milestone.**

The following feature directories are in scope for this milestone:
${list}

When selecting features from \`/.aidd/features/*/feature.json\`:
- **ONLY** work on features whose directory name appears in the list above
- **SKIP** all other features entirely
- This milestone filter applies to ALL feature selection throughout this session

---

`;
}
