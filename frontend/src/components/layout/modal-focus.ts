// Pure wrap-around index used by the dialog focus trap. Returns the index of
// the element that should receive focus when Tab/Shift+Tab is pressed while the
// element at currentIndex is focused. Returns -1 when there is nothing to focus.
export function nextFocusIndex(count: number, currentIndex: number, shiftKey: boolean): number {
	if (count <= 0) return -1;
	if (shiftKey) {
		return currentIndex <= 0 ? count - 1 : currentIndex - 1;
	}
	return currentIndex >= count - 1 ? 0 : currentIndex + 1;
}
