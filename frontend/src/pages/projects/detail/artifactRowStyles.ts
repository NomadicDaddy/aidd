import { touchTargetRowClass } from '../../../lib/touchTarget.ts';

/**
 * The click target that opens an artifact in the viewer, shared by the two inventory row
 * components. Both previously spelled their focus ring `focus-visible:ring-teal-400` — a raw
 * palette value that does not track the accent token and was the only hard-coded ring left on the
 * project page. This is the same combination `formControlClass` uses.
 *
 * The row idiom rather than the text one: these are stacked bordered rows, and an expansion that
 * borrowed 12px above would put this button's hit area inside the row above it. Measured at 20px
 * for a single-line name.
 */
export const artifactRowButtonClass = `min-w-0 rounded text-left hover:underline focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none ${touchTargetRowClass}`;
