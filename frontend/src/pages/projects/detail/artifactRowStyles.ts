import { touchTargetRowClass } from '../../../lib/touchTarget.ts';

/**
 * The click target that opens an artifact in the viewer, shared by the two inventory row
 * components so neither spells its focus ring from a raw palette value that does not track the
 * accent token. This is the same combination `formControlClass` uses.
 *
 * The row idiom rather than the text one: these are stacked bordered rows, and an expansion that
 * borrowed 12px above would put this button's hit area inside the row above it. Measured at 20px
 * for a single-line name.
 */
export const artifactRowButtonClass = `min-w-0 rounded text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${touchTargetRowClass}`;
