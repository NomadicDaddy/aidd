/**
 * Parameters a launcher fills from the selected project rather than asking the operator for.
 *
 * Both launch panels had their own copy of this set, so a new auto-filled parameter had to be added
 * twice or one panel would start prompting for it.
 */
export const autoParameters = new Set(['application', 'projectDir', 'projectName']);
