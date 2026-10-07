export interface InputSelection {
  start: number | null;
  end: number | null;
}

export function captureInputSelection(target: HTMLInputElement | HTMLTextAreaElement): InputSelection {
  return { start: target.selectionStart, end: target.selectionEnd };
}

export function restoreInputSelection(
  target: HTMLInputElement | HTMLTextAreaElement,
  selection: InputSelection,
): void {
  if (selection.start === null || selection.end === null) return;
  const start = Math.min(selection.start, target.value.length);
  const end = Math.min(selection.end, target.value.length);
  target.setSelectionRange(start, end);
}