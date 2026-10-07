import { describe, expect, it } from 'vitest';
import { captureInputSelection, restoreInputSelection } from '../inputSelection';

describe('input selection preservation', () => {
  it('captures and restores a Persian/RTL caret position', () => {
    const input = document.createElement('input');
    input.value = 'ورود به معامله';
    input.setSelectionRange(5, 5);

    const selection = captureInputSelection(input);
    input.value = 'ورود جدید به معامله';
    restoreInputSelection(input, selection);

    expect(selection).toEqual({ start: 5, end: 5 });
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(5);
  });

  it('clamps a stale selection after the controlled value shrinks', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'یادداشت طولانی';
    textarea.setSelectionRange(20, 20);

    const selection = captureInputSelection(textarea);
    textarea.value = 'کوتاه';
    restoreInputSelection(textarea, selection);

    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
  });
});